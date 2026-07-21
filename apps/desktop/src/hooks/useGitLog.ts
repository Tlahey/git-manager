import { useQuery } from '@tanstack/react-query'
import type { GitGraphNode } from '@git-manager/git-types'
import { apiGetLog } from '../api/git.api'

interface UseGitLogOptions {
  limit?: number
  skip?: number
  branch?: string
  showStashes?: boolean
  hiddenStashes?: string[]
  /** Whether a synthetic WIP / paused-rebase row will be rendered above the graph. Part of the
   * query key: when the working tree flips clean↔dirty the Rust column layout genuinely changes
   * (HEAD's lane is only seeded at column 0 while that row exists), so the log is refetched. */
  headHasWip?: boolean
}

export function useGitLog(repoPath: string, opts?: UseGitLogOptions) {
  return useQuery<GitGraphNode[]>({
    queryKey: ['git-log', repoPath, opts],
    queryFn: () => apiGetLog(repoPath, opts),
    enabled: !!repoPath,
    staleTime: 30_000,
  })
}
