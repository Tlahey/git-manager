import { useQuery } from '@tanstack/react-query'
import type { GitGraphNode } from '@git-manager/git-types'
import { apiGetLog } from '../api/git.api'

interface UseGitLogOptions {
  limit?: number
  skip?: number
  branch?: string
  showStashes?: boolean
  hiddenStashes?: string[]
}

export function useGitLog(repoPath: string, opts?: UseGitLogOptions) {
  return useQuery<GitGraphNode[]>({
    queryKey: ['git-log', repoPath, opts],
    queryFn: () => apiGetLog(repoPath, opts),
    enabled: !!repoPath,
    staleTime: 30_000,
  })
}
