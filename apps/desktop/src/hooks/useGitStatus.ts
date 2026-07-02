import { useQuery } from '@tanstack/react-query'
import { apiGetRepoStatus } from '../api/git.api'

export function useGitStatus(repoPath: string) {
  return useQuery({
    queryKey: ['git-status', repoPath],
    queryFn: () => apiGetRepoStatus(repoPath),
    enabled: !!repoPath,
    refetchInterval: 3000,
  })
}
