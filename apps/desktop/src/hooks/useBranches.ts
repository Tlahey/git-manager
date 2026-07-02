import { useQuery } from '@tanstack/react-query'
import type { GitBranch } from '@git-manager/git-types'
import { apiGetBranches } from '../api/git.api'

export function useBranches(repoPath: string) {
  return useQuery<GitBranch[]>({
    queryKey: ['branches', repoPath],
    queryFn: () => apiGetBranches(repoPath),
    enabled: !!repoPath,
    staleTime: 15_000,
  })
}
