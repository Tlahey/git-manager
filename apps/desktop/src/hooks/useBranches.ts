import { useQuery } from '@tanstack/react-query'
import type { GitBranch } from '@git-manager/git-types'
import { getBranches } from '../lib/tauri'

export function useBranches(repoPath: string) {
  return useQuery<GitBranch[]>({
    queryKey: ['branches', repoPath],
    queryFn: () => getBranches(repoPath),
    enabled: !!repoPath,
    staleTime: 15_000,
  })
}
