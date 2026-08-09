/** Default destination for a new worktree: a sibling `<project>.worktrees` directory that mirrors
 * the branch name verbatim — slashes included, so `claude/foo` nests under a `claude/` folder.
 * `repoRoot` MUST be the main worktree's path, not a linked worktree, otherwise the destination
 * ends up nested inside the current worktree. e.g. `/Users/x/proj` + `claude/foo`
 * → `/Users/x/proj.worktrees/claude/foo`. */
export function defaultWorktreePath(repoRoot: string, branch: string): string {
  const trimmed = repoRoot.replace(/\/+$/, '')
  return `${trimmed}.worktrees/${branch}`
}

/** Joins a user-picked parent directory with the branch name (slashes preserved). */
export function worktreePathInParent(parentDir: string, branch: string): string {
  const trimmed = parentDir.replace(/\/+$/, '')
  return `${trimmed}/${branch}`
}
