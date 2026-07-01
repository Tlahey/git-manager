import { useQuery } from '@tanstack/react-query'
import type { GitGraphNode } from '@git-manager/git-types'
import { getLog } from '../lib/tauri'

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
    queryFn: () => getLog(repoPath, opts),
    enabled: !!repoPath,
    staleTime: 30_000,
  })
}
