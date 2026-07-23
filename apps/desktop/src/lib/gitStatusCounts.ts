import type { GitStatus } from '@git-manager/git-types'

/** Total number of pending entries in a working tree (staged + unstaged + untracked + conflicted). */
export function countChanges(status: GitStatus): number {
  return (
    status.staged.length +
    status.unstaged.length +
    status.untracked.length +
    status.conflicted.length
  )
}

/**
 * Buckets staged+unstaged entries by kind for a compact +/~/− breakdown — untracked files count as
 * added; renamed/copied/typechange entries count as modified (still edited content). Shared by the
 * sidebar's worktree hover breakdown and the Launchpad's local-WIP tab.
 */
export function bucketChanges(status: GitStatus): {
  added: number
  modified: number
  deleted: number
} {
  let added = status.untracked.length
  let modified = 0
  let deleted = 0
  for (const entry of [...status.staged, ...status.unstaged]) {
    if (entry.status === 'added') added++
    else if (entry.status === 'deleted') deleted++
    else modified++
  }
  return { added, modified, deleted }
}
