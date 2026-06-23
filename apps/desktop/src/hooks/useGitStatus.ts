import { useQuery } from '@tanstack/react-query'
import { getRepoStatus } from '../lib/tauri'

export function useGitStatus(repoPath: string) {
  return useQuery({
    queryKey: ['git-status', repoPath],
    queryFn: () => getRepoStatus(repoPath),
    enabled: !!repoPath,
    refetchInterval: 3000,
  })
}
