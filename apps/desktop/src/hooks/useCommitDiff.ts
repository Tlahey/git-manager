import { useQuery } from '@tanstack/react-query'
import type { GitDiff } from '@git-manager/git-types'
import { getCommitDiff } from '../lib/tauri'

export function useCommitDiff(repoPath: string, oid: string | null) {
  return useQuery<GitDiff>({
    queryKey: ['commit-diff', repoPath, oid],
    queryFn: () => getCommitDiff(repoPath, oid!),
    enabled: !!repoPath && !!oid,
    staleTime: Infinity,
  })
}
