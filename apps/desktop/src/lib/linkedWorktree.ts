import type { GitRepo } from '@git-manager/git-types'

/**
 * Whether a repo snapshot describes a *linked* worktree (a "workspace") rather than a repository.
 *
 * The backend sets `mainWorktreePath` to the owning repository's main worktree; for a normal repo
 * it equals `path`. It is optional only so older cached snapshots and test fixtures stay valid —
 * when it is missing we cannot tell, and deliberately answer `false`: wrongly hiding one of the
 * user's repositories is far worse than briefly listing a worktree.
 */
export function isLinkedWorktree(repo: Pick<GitRepo, 'path' | 'mainWorktreePath'>): boolean {
  return repo.mainWorktreePath !== undefined && repo.mainWorktreePath !== repo.path
}
