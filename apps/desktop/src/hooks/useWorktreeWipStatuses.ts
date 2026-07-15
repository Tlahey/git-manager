import useSWR from 'swr'
import type { GitStatus } from '@git-manager/git-types'
import { apiListWorktrees } from '../api/worktree.api'
import { apiGetRepoStatus } from '../api/git.api'

export interface WorktreeWipStatus {
  path: string
  branch: string
  totalChanges: number
}

function countChanges(status: GitStatus): number {
  return (
    status.staged.length + status.unstaged.length + status.untracked.length + status.conflicted.length
  )
}

async function fetchWorktreeWipStatuses(repoPath: string): Promise<WorktreeWipStatus[]> {
  const worktrees = await apiListWorktrees(repoPath)
  const linked = worktrees.filter(
    (wt) => !wt.isMain && wt.path !== repoPath && wt.branch !== '(detached HEAD)'
  )
  const statuses = await Promise.all(
    linked.map(async (wt) => ({
      path: wt.path,
      branch: wt.branch,
      totalChanges: countChanges(await apiGetRepoStatus(wt.path)),
    }))
  )
  return statuses.filter((s) => s.totalChanges > 0)
}

/**
 * WIP status for every linked worktree (other than the active repo) that has uncommitted
 * changes — drives the extra "// WIP" rows rendered on those branches' lanes in the commit
 * graph, alongside the primary WIP row for the currently active repo/tab.
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
