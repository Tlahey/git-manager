import useSWR from 'swr'
import type { GitDiff } from '@git-manager/git-types'
import { apiCompareRefs } from '../../../api/git.api'

/**
 * Diff between two arbitrary refs (branch vs branch, but also a tag or a SHA) — the data behind the
 * branch comparison dialog. Idle until both sides are known and different: comparing a ref against
 * itself is an empty diff the backend would still have to walk.
 *
 * Not revalidated on focus: a comparison is a snapshot the user asked for, and two refs only move
 * when the user themselves does something to them.
 */
export function useRefComparison(
  repoPath: string | null,
  baseRef: string | null,
  headRef: string | null
) {
  const enabled = !!repoPath && !!baseRef && !!headRef && baseRef !== headRef
  return useSWR<GitDiff>(
    enabled ? ['ref-comparison', repoPath, baseRef, headRef] : null,
    () => apiCompareRefs(repoPath as string, baseRef as string, headRef as string),
    { revalidateOnFocus: false, revalidateIfStale: false }
  )
}
