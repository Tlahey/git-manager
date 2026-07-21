import type { GitGraphNode, GitRef } from '@git-manager/git-types'

const isMainish = (shortName: string) =>
  shortName === 'main' ||
  shortName === 'master' ||
  shortName.endsWith('/main') ||
  shortName.endsWith('/master')

interface Tip {
  oid: string
  ref: GitRef
  priority: number
}

/**
 * Maps each commit OID to the branch it should be attributed to, so a commit with no ref badge of
 * its own can hint — on hover — which branch it belongs to.
 *
 * The attribution is **first-parent aware**, so a commit developed on a feature branch and merged
 * into `main` is credited to the branch it came from, not to `main`. This runs in two passes over
 * the tips, both ordered by priority — local `main`/`master` first, then other local branches, then
 * remotes; ties keep the caller's order (newest-first):
 *
 *  1. **First-parent chains.** Each tip walks only its first-parent line (`parentOids[0]`), claiming
 *     unclaimed commits and pruning at claimed ones. Because `main` runs first it reserves its own
 *     mainline (including its merge commits) down to the root, so a feature branch's first-parent
 *     walk stops at the fork point (already owned by `main`) and keeps only the commits unique to the
 *     branch — i.e. the ones it merged in.
 *  2. **Full ancestor DAG.** A second pass walks every parent to mop up commits that no branch's
 *     first-parent line reached — e.g. a branch that was merged and then deleted, whose commits now
 *     hang off a merge's second parent with no ref of their own. These fall to the highest-priority
 *     branch that contains them (usually `main`), matching the old reachability behaviour.
 *
 * Both passes prune at already-owned commits, and every ancestor of a claimed commit is claimed
 * before it, so pruning is safe and the whole thing stays O(V + E).
 *
 * Reachability is used rather than lane colour because the backend's 8-hue palette recycles — it
 * even reuses main's exact blue/purple — so colour can't identify a branch.
 */
/** Normalized branch identity, so a local branch and its remote counterpart map together
 *  (`origin/feat` → `feat`) and hovering either highlights the same lane. */
function branchKey(ref: GitRef): string {
  if (ref.type === 'remote') {
    const parts = ref.shortName.split('/')
    if (parts.length > 1) return parts.slice(1).join('/')
  }
  return ref.shortName
}

/**
 * The commits to highlight while `hoveredRef` is the drag drop target: the commits that *belong to*
 * that ref's branch lane — its own first-parent-attributed work — and nothing else. This is the
 * lane attribution from {@link computeLaneBranchByOid}, so it excludes the shared ancestors below
 * the fork (they belong to `main`) and any children (owned by whatever branch they're on).
 *
 * A tag isn't a lane owner, so it's attributed to the branch owning the commit it points at (or, if
 * none, highlights just that commit). Returns `null` when nothing is hovered.
 */
export function collectRefDropHighlight(
  hoveredRef: GitRef | null | undefined,
  laneRefByOid: Map<string, GitRef>
): Set<string> | null {
  if (!hoveredRef) return null

  let targetRef: GitRef | undefined = hoveredRef
  if (hoveredRef.type === 'tag') {
    targetRef = laneRefByOid.get(hoveredRef.commitOid)
    if (!targetRef) return new Set([hoveredRef.commitOid])
  }
  const key = branchKey(targetRef)

  const set = new Set<string>()
  for (const [oid, ownerRef] of laneRefByOid) {
    if (branchKey(ownerRef) === key) set.add(oid)
  }
  // Always light the hovered ref's own tip, even if attribution credited it to a higher-priority
  // branch (e.g. a branch pointing at a commit main's first-parent line already owns).
  set.add(hoveredRef.commitOid)
  return set
}

export function computeLaneBranchByOid(nodes: GitGraphNode[]): Map<string, GitRef> {
  const byOid = new Map(nodes.map((n) => [n.commit.oid, n] as const))
  const owner = new Map<string, GitRef>()

  // One tip per branch/remote ref — several branches can point at the same commit (e.g. `main`,
  // `origin/main` and a couple of `claude/*` branches all on the current tip), and we must register
  // `main` as its own priority-0 tip rather than pick whichever ref happens to be first.
  const tips: Tip[] = []
  for (const n of nodes) {
    for (const r of n.refs) {
      if (r.type !== 'branch' && r.type !== 'remote') continue
      const priority = isMainish(r.shortName) ? 0 : r.type === 'branch' ? 1 : 2
      tips.push({ oid: n.commit.oid, ref: r, priority })
    }
  }

  // Stable sort keeps the caller's (newest-first) node order within each priority tier.
  tips.sort((a, b) => a.priority - b.priority)

  // Pass 1: walk each tip's first-parent line, crediting merged-in commits to their own branch.
  // Pruning at an already-owned commit is safe here — a first-parent line is linear, so everything
  // above the prune point already belongs to a higher-priority branch.
  for (const tip of tips) {
    const stack = [tip.oid]
    while (stack.length > 0) {
      const cur = stack.pop() as string
      if (owner.has(cur)) continue
      const n = byOid.get(cur)
      if (!n) continue // parent outside the loaded window
      owner.set(cur, tip.ref)
      if (n.commit.parentOids.length > 0) stack.push(n.commit.parentOids[0])
    }
  }

  // Pass 2: full reachability mops up commits no first-parent line reached (e.g. a merged-then-
  // deleted branch, now hanging off a merge's second parent). A shared `visited` set keeps this
  // O(V + E): we still traverse *through* pass-1-owned commits — a merge commit owned by main via
  // its first parent still has an unclaimed second-parent subtree below it — but only claim the ones
  // no branch owns yet, to the highest-priority tip that reaches them (tips are in priority order).
  const visited = new Set<string>()
  for (const tip of tips) {
    const stack = [tip.oid]
    while (stack.length > 0) {
      const cur = stack.pop() as string
      if (visited.has(cur)) continue
      visited.add(cur)
      const n = byOid.get(cur)
      if (!n) continue // parent outside the loaded window
      if (!owner.has(cur)) owner.set(cur, tip.ref)
      for (const p of n.commit.parentOids) stack.push(p)
    }
  }

  return owner
}
