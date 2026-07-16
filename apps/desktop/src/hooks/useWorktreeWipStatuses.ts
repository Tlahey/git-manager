import useSWR from 'swr'
import type { GitStatus } from '@git-manager/git-types'
import { apiListWorktrees } from '../api/worktree.api'
import { apiGetRepoStatus } from '../api/git.api'

export interface WorktreeWipStatus {
  path: string
  branch: string
  totalChanges: number
  added: number
  modified: number
  deleted: number
}

function countChanges(status: GitStatus): number {
  return (
    status.staged.length + status.unstaged.length + status.untracked.length + status.conflicted.length
  )
}

/** Buckets staged+unstaged entries by kind for the sidebar's hover breakdown — untracked files
 * count as added; renamed/copied/typechange entries count as modified (still edited content). */
function bucketChanges(status: GitStatus): { added: number; modified: number; deleted: number } {
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

async function fetchWorktreeWipStatuses(repoPath: string): Promise<WorktreeWipStatus[]> {
  const worktrees = await apiListWorktrees(repoPath)
  const linked = worktrees.filter(
    (wt) => !wt.isMain && wt.path !== repoPath && wt.branch !== '(detached HEAD)'
  )
  const statuses = await Promise.all(
    linked.map(async (wt) => {
      const status = await apiGetRepoStatus(wt.path)
      return {
        path: wt.path,
        branch: wt.branch,
        totalChanges: countChanges(status),
        ...bucketChanges(status),
      }
    })
  )
  return statuses.filter((s) => s.totalChanges > 0)
}

/**
 * WIP status for every linked worktree (other than the active repo) that has uncommitted
 * changes — drives the extra "// WIP" rows rendered on those branches' lanes in the commit
 * graph, alongside the primary WIP row for the currently active repo/tab, and the pending-changes
 * bubble on the sidebar's worktree rows.
 */
export function useWorktreeWipStatuses(repoPath: string) {
  return useSWR<WorktreeWipStatus[], Error>(
    repoPath ? ['worktree-wip-statuses', repoPath] : null,
    () => fetchWorktreeWipStatuses(repoPath),
    {
      refreshInterval: 5000,
      revalidateOnFocus: true,
    }
  )
}
