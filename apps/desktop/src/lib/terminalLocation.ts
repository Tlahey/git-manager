import type { GitWorktree } from '@git-manager/git-types'

/**
 * Naming the place a terminal session is bound to.
 *
 * A session only ever stores its `cwd`, never a branch: the shell keeps its directory for life,
 * while the branch checked out there is someone else's live state — the user can switch it from
 * inside that very terminal. So the label is resolved against the worktree list on every render,
 * and a stale name is impossible by construction.
 */

/** The last path segment, trailing slashes ignored (`/a/b/` → `b`). */
export function directoryName(path: string): string {
  const segments = path.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? path
}

/**
 * What to call the worktree a session lives in: the branch checked out there, or the folder name
 * when the path is not one of the repo's worktrees (another repo's tab), when the branch is unknown,
 * or when HEAD is detached — none of which are a name a user could act on.
 */
export function terminalLocationLabel(cwd: string, worktrees: GitWorktree[]): string {
  const worktree = worktrees.find((wt) => wt.path === cwd)
  const branch = worktree?.branch
  if (!branch || branch === '(detached HEAD)') return directoryName(cwd)
  return branch
}
