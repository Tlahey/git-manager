import { useMemo } from 'react'
import useSWR from 'swr'
import type { MergeTargetStatus } from '@git-manager/git-types'
import { apiGetMergeTargetStatus } from '../api/mergeTarget.api'
import { useBranches } from './useBranches'
import { useEffectiveRepoSettings } from './useEffectiveRepoSettings'

/**
 * Merge-target status of the checked-out branch of `repoPath` — whether it sits on its target
 * branch, and whether merging into that target would conflict. Backed by `get_merge_target_status`,
 * which simulates the merge in memory only, so polling it costs nothing but CPU.
 *
 * Two things drive the cache key beyond the repo path:
 * - the repo's `targetBranches` setting (see `useEffectiveRepoSettings`), so editing it in Settings
 *   refetches immediately;
 * - a fingerprint of the branch tips (`useBranches`, already loaded by the toolbar). Every event
 *   that can change the answer — a commit, a checkout, a fetch moving `origin/main` — moves one of
 *   those tips, which re-keys this query without any manual invalidation at the call sites.
 */
export function useMergeTargetStatus(repoPath: string | null) {
  const { targetBranches } = useEffectiveRepoSettings(repoPath)
  const { data: branches } = useBranches(repoPath ?? '')

  const tipsFingerprint = useMemo(
    () => (branches ?? []).map((b) => `${b.name}@${b.commitOid}`).join(','),
    [branches]
  )

  return useSWR<MergeTargetStatus>(
    repoPath ? ['merge-target-status', repoPath, targetBranches.join(','), tipsFingerprint] : null,
    () => apiGetMergeTargetStatus(repoPath as string, targetBranches),
    { keepPreviousData: true }
  )
}
