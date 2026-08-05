import type { GitCommit, GitGraphNode } from '@git-manager/git-types'
import { isSyntheticRow } from './syntheticRows'
import { combineInto, initPlan, type RebasePlanStep } from '../rebase-editor/rebasePlan'

/**
 * Pure logic behind dragging commits inside the graph to reorder them, or to drop one onto another
 * to combine the two — the graph-side entry point to the same `run_interactive_rebase` the
 * "Rebasing Commit" window drives (see `../rebase-editor/rebasePlan.ts`, whose transitions this
 * module reuses rather than re-deriving).
 *
 * ## Why the reorderable window stops at the first merge
 *
 * `git rebase -i` replays a *linear* range. Handed a range that spans a merge commit it flattens
 * the merge — the second parent's commits are replayed inline and the merge itself disappears —
 * which is a silent history rewrite nobody asked for by dragging a row two rows up. So the window
 * of commits this feature will touch is HEAD's own first-parent line, cut short *before* the first
 * merge commit: everything in it is guaranteed to be a linear `base..HEAD`, and every drop is
 * therefore expressible as a plain reordering of picks.
 *
 * That is also why a commit sitting on another branch's lane can never be dragged: it isn't on
 * HEAD's first-parent line, so it isn't in the window. The user's rule — commits move relative to
 * the branch they sit on — falls out of this: the branch in question is always the checked-out one,
 * and the rebase runs on it.
 */

/**
 * Fraction of a row slot's height, at each edge, that reads as "between two commits" rather than
 * "on this commit": the middle half is the combine target, the outer quarter top and bottom are the
 * gaps. Measured against the *slot* (40px at standard density, 32px at small), so a quarter is a
 * 10px band straddling the visible gutter between two rows — a target the cursor can actually hit.
 */
export const GAP_BAND_RATIO = 0.25

/** Where a drag currently wants to land. `oid` is always the row under the cursor. */
export type CommitDropTarget =
  /** Combine the dragged commits into `oid` (squash / fixup). */
  | { kind: 'combine'; oid: string }
  /** Move the dragged commits into the gap on `edge` of `oid` ('above' = newer side). */
  | { kind: 'gap'; oid: string; edge: 'above' | 'below' }

export type CommitReorderKind = 'reorder' | 'combine'

/** Why a drop can't run — each maps to an i18n key in `commitReorder.reject.*`. */
export type CommitReorderRejection =
  /** A dragged commit, or the drop target, sits outside HEAD's linear first-parent window. */
  | 'notReorderable'
  /** Nothing to move: empty drag, a commit dropped on itself, or a gap it already occupies. */
  | 'noop'

export interface CommitReorderOperation {
  kind: CommitReorderKind
  /** Dragged commits, newest first (graph order). */
  sourceOids: string[]
  target: CommitDropTarget
  /** Oldest commit of the rewritten range — the `baseOid` of `run_interactive_rebase`. */
  baseOid: string
  /** Every commit the rebase rewrites (`baseOid..HEAD`), newest first. */
  affectedOids: string[]
  /**
   * Resulting order of {@link affectedOids}, newest first. It is both the dialog's preview and the
   * source of the todo itself (see {@link buildReorderPlan}) — the preview can't drift from what
   * runs because there is only one order.
   */
  resultOids: string[]
}

/**
 * HEAD's first-parent line, newest first, cut before the first merge commit — the commits this
 * feature is allowed to move. Empty when HEAD isn't among the loaded nodes.
 */
export function collectReorderableOids(nodes: GitGraphNode[], headOid: string | null): string[] {
  if (!headOid) return []
  const byOid = new Map(nodes.map((n) => [n.commit.oid, n]))
  const out: string[] = []
  const seen = new Set<string>()
  let current = byOid.get(headOid)
  while (current) {
    const oid = current.commit.oid
    // A cycle is impossible in a DAG, but a malformed/partial walk must not hang the UI.
    if (seen.has(oid) || isSyntheticRow(oid)) break
    // Stop *before* the merge: rebasing across it would flatten it (see the module comment).
    if (current.commit.parentOids.length > 1) break
    seen.add(oid)
    out.push(oid)
    const parent = current.commit.parentOids[0]
    current = parent ? byOid.get(parent) : undefined
  }
  return out
}

/**
 * The OID HEAD points at, resolved from the graph's own nodes: the explicit `HEAD` ref badge
 * (detached), else the node carrying the checked-out branch, else the newest real commit.
 */
export function findHeadOid(nodes: GitGraphNode[], headBranchName: string | null): string | null {
  const detached = nodes.find((n) => n.refs.some((r) => r.type === 'HEAD'))
  if (detached) return detached.commit.oid
  if (headBranchName) {
    const onBranch = nodes.find((n) =>
      n.refs.some(
        (r) => r.type === 'branch' && (r.shortName === headBranchName || r.name === headBranchName)
      )
    )
    if (onBranch) return onBranch.commit.oid
  }
  return nodes.find((n) => !isSyntheticRow(n.commit.oid))?.commit.oid ?? null
}

/**
 * Which commits of `window` are already published, i.e. reachable from a remote-tracking ref.
 *
 * The window is a linear first-parent chain, so a remote ref sitting on `window[i]` makes every
 * older commit (`i` and beyond) published too — hence a single index rather than a set. `null`
 * when no remote ref is on the window at all.
 */
export function firstPublishedIndex(nodes: GitGraphNode[], window: string[]): number | null {
  const remoteOids = new Set(
    nodes.filter((n) => n.refs.some((r) => r.type === 'remote')).map((n) => n.commit.oid)
  )
  if (remoteOids.size === 0) return null
  const index = window.findIndex((oid) => remoteOids.has(oid))
  return index === -1 ? null : index
}

/** The drop target a cursor at `offsetRatio` (0 = row top, 1 = row bottom) is aiming at. */
export function resolveDropTarget(oid: string, offsetRatio: number): CommitDropTarget {
  if (offsetRatio <= GAP_BAND_RATIO) return { kind: 'gap', oid, edge: 'above' }
  if (offsetRatio >= 1 - GAP_BAND_RATIO) return { kind: 'gap', oid, edge: 'below' }
  return { kind: 'combine', oid }
}

/**
 * `window` with `sourceOids` lifted out and re-inserted, in their original relative order, at
 * `gap` — an index into the *original* window (`0` = above the newest commit, `window.length` =
 * below the oldest). Newest first, like every list here.
 */
export function reorderWindow(window: string[], sourceOids: string[], gap: number): string[] {
  const sources = new Set(sourceOids)
  const removedBefore = window.slice(0, gap).filter((oid) => sources.has(oid)).length
  const rest = window.filter((oid) => !sources.has(oid))
  const ordered = window.filter((oid) => sources.has(oid))
  const at = gap - removedBefore
  return [...rest.slice(0, at), ...ordered, ...rest.slice(at)]
}

/**
 * Turns a finished drag into the operation to confirm and run, or the reason it can't be one.
 *
 * `window` is {@link collectReorderableOids}' output; `draggedOids` may be in any order (the caller
 * hands over a selection) and is normalized to graph order here.
 */
export function planOperation(
  window: string[],
  draggedOids: string[],
  target: CommitDropTarget
): CommitReorderOperation | { error: CommitReorderRejection } {
  const indexOf = new Map(window.map((oid, i) => [oid, i]))
  const dragged = new Set(draggedOids)
  const sourceOids = window.filter((oid) => dragged.has(oid))

  if (dragged.size === 0) return { error: 'noop' }
  // Every dragged commit must be in the window; `sourceOids` silently drops the ones that aren't,
  // so compare counts rather than trusting it.
  if (sourceOids.length !== dragged.size) return { error: 'notReorderable' }
  if (!indexOf.has(target.oid)) return { error: 'notReorderable' }

  const oldestSource = Math.max(...sourceOids.map((oid) => indexOf.get(oid)!))

  if (target.kind === 'combine') {
    if (dragged.has(target.oid)) return { error: 'noop' }
    const targetIndex = indexOf.get(target.oid)!
    const lastIndex = Math.max(oldestSource, targetIndex)
    const affectedOids = window.slice(0, lastIndex + 1)
    // The combined commits fold into the target, so they leave the list where they were and
    // reappear right below it — the same shape `combineInto` gives the plan.
    const resultOids = reorderWindow(affectedOids, sourceOids, targetIndex + 1)
    return {
      kind: 'combine',
      sourceOids,
      target,
      baseOid: window[lastIndex],
      affectedOids,
      resultOids,
    }
  }

  const targetIndex = indexOf.get(target.oid)!
  const gapIndex = target.edge === 'above' ? targetIndex : targetIndex + 1
  // A gap below the oldest window commit still rewrites that commit — it stops being the oldest.
  const lastIndex = Math.max(oldestSource, Math.min(gapIndex, window.length - 1))
  const affectedOids = window.slice(0, lastIndex + 1)
  const resultOids = reorderWindow(affectedOids, sourceOids, gapIndex)
  if (resultOids.every((oid, i) => oid === affectedOids[i])) return { error: 'noop' }

  return {
    kind: 'reorder',
    sourceOids,
    target,
    baseOid: window[lastIndex],
    affectedOids,
    resultOids,
  }
}

/**
 * The `git rebase -i` todo for `operation`, built from the authoritative commit list the backend
 * returned for `operation.baseOid` (oldest first).
 *
 * Throws when that list doesn't cover the operation's commits — the graph moved under the drag
 * (a fetch landed, a hook committed) and running the plan anyway would rewrite the wrong range.
 */
export function buildReorderPlan(
  commitsOldestFirst: GitCommit[],
  operation: CommitReorderOperation,
  combineMode: 'squash' | 'fixup'
): RebasePlanStep[] {
  const plan = initPlan(commitsOldestFirst)
  const byOid = new Map(plan.map((step) => [step.commit.oid, step]))
  for (const oid of operation.affectedOids) {
    if (!byOid.has(oid)) {
      throw new Error(`Commit ${oid} is no longer in the rebase range`)
    }
  }

  if (operation.kind === 'combine') {
    return combineInto(plan, operation.target.oid, operation.sourceOids, combineMode)
  }

  // `resultOids` is newest first; the todo is oldest first. Commits the backend listed but the
  // window didn't reach (it stops at a merge) can't exist here — `baseOid` is inside the window —
  // but keep any straggler in place rather than dropping it from the todo, which would delete it.
  const desired = [...operation.resultOids].reverse()
  const moved = new Set(desired)
  const tail = plan.filter((step) => !moved.has(step.commit.oid))
  return [...tail, ...desired.map((oid) => byOid.get(oid)!)]
}

/** The commits `operation` leaves standing, in their resulting order, newest first. */
function survivingOids(operation: CommitReorderOperation): string[] {
  if (operation.kind !== 'combine') return operation.resultOids
  const folded = new Set(operation.sourceOids)
  return operation.resultOids.filter((oid) => !folded.has(oid))
}

/**
 * Where the commits the user just moved ended up, so the graph can put the selection back on
 * *them* rather than on whatever now occupies the row they were dragged from.
 *
 * A rebase rewrites every commit whose parent changed, so a moved commit always comes back with a
 * new OID and the old selection points at nothing. It can't be followed by identity — but it can be
 * followed by **position**: the todo we submitted fixes the resulting order, so the rewritten range
 * is `resultOids` commit-for-commit, and the new range is the top of HEAD's first-parent line.
 * Matching the two by index is therefore exact, not a guess.
 *
 * `newWindow` is {@link collectReorderableOids} run on the *reloaded* graph. Returns the moved
 * commits newest first (for a combine, the single commit the others were folded into), or an empty
 * array if the window is too short to be the post-rebase one.
 */
export function locateMovedCommits(
  operation: CommitReorderOperation,
  newWindow: string[]
): string[] {
  const survivors = survivingOids(operation)
  if (newWindow.length < survivors.length) return []

  const positions =
    operation.kind === 'combine'
      ? [survivors.indexOf(operation.target.oid)]
      : operation.sourceOids.map((oid) => survivors.indexOf(oid))

  return positions.filter((index) => index >= 0).map((index) => newWindow[index])
}

/**
 * Whether `newWindow` is still the pre-rebase history — i.e. the graph has not reloaded yet, and
 * mapping {@link locateMovedCommits}' positions onto it would select the wrong commits.
 *
 * The test is that a moved commit's *old* OID is still on HEAD's first-parent line. Every moved
 * commit is rewritten (its parent changed, by definition of having moved), so once the reload
 * lands not one of them can still be there. An old OID kept alive by another branch doesn't
 * confuse this: the window only walks HEAD.
 */
export function isStaleWindow(operation: CommitReorderOperation, newWindow: string[]): boolean {
  const stillThere = new Set(newWindow)
  return operation.sourceOids.some((oid) => stillThere.has(oid))
}
