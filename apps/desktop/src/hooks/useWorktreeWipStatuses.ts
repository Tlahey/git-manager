import useSWR from 'swr'
import { apiListWorktrees } from '../api/worktree.api'
import { apiGetRepoStatus } from '../api/git.api'
import { countChanges, bucketChanges } from '../lib/gitStatusCounts'

export interface WorktreeWipStatus {
  path: string
  branch: string
  totalChanges: number
  added: number
  modified: number
  deleted: number
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
