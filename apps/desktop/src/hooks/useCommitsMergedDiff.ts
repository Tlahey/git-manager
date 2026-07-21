import { useQuery } from '@tanstack/react-query'
import type { GitDiff } from '@git-manager/git-types'
import { apiGetCommitsMergedDiff } from '../api/git.api'

/**
 * Merged diff across a multi-commit selection: the cumulative change set spanning
 * `baseOid^..headOid` (oldest selected commit's first parent up to the newest selected commit).
 * Disabled until both endpoints are known.
 */
export function useCommitsMergedDiff(
  repoPath: string,
  baseOid: string | null,
  headOid: string | null
) {
  return useQuery<GitDiff>({
    queryKey: ['commits-merged-diff', repoPath, baseOid, headOid],
    queryFn: () => apiGetCommitsMergedDiff(repoPath, baseOid!, headOid!),
    enabled: !!repoPath && !!baseOid && !!headOid,
    staleTime: Infinity,
  })
}
