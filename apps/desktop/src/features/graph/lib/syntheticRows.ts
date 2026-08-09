/**
 * The graph shows rows that stand for something other than a commit: the working tree ("WIP"), the
 * same for each linked worktree that has uncommitted changes ("WIP:<path>"), and the row for a
 * conflicted merge/rebase ("CONFLICT"). Their `oid` is that sentinel string rather than a real one,
 * so anything that reaches for a commit — a diff, a context-menu action, a bisect pick, the author
 * list — has to skip them first.
 *
 * That test used to be spelled out at ~11 call sites in three different ways
 * (`oid === 'WIP' || oid === 'CONFLICT' || oid.startsWith('WIP:')`, `isWipRow(oid) || oid ===
 * 'CONFLICT'`, and a couple that quietly omitted the `WIP:` case). Adding a fourth kind of
 * synthetic row would have meant finding every one of them, so the predicates live here instead.
 */

/** Prefix of a linked worktree's WIP row: `WIP:<worktree path>`. */
const WORKTREE_WIP_PREFIX = 'WIP:'

/** True for the main working-tree row (`'WIP'`) and every linked worktree's (`'WIP:<path>'`). */
export function isWipRow(oid: string): boolean {
  return oid === 'WIP' || oid.startsWith(WORKTREE_WIP_PREFIX)
}

/** True for any row that doesn't stand for a real commit — every WIP row, plus `'CONFLICT'`. */
export function isSyntheticRow(oid: string): boolean {
  return isWipRow(oid) || oid === 'CONFLICT'
}

/**
 * The worktree path carried by a `WIP:<path>` row's oid, or `null` for any other row — including
 * the main `'WIP'` one, which stands for the active repo rather than a linked worktree.
 */
export function worktreeWipPath(oid: string): string | null {
  return oid.startsWith(WORKTREE_WIP_PREFIX) ? oid.slice(WORKTREE_WIP_PREFIX.length) : null
}
