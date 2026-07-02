import { useQuery } from '@tanstack/react-query'
import type { GitDiff } from '@git-manager/git-types'
import { apiGetCommitDiff } from '../api/git.api'

export function useCommitDiff(repoPath: string, oid: string | null) {
  return useQuery<GitDiff>({
    queryKey: ['commit-diff', repoPath, oid],
    queryFn: () => apiGetCommitDiff(repoPath, oid!),
    enabled: !!repoPath && !!oid,
    staleTime: Infinity,
  })
}
