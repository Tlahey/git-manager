import { useState } from 'react'
import useSWR from 'swr'
import {
  fetchPrFilesViewedState,
  markPrFileAsViewed,
  unmarkPrFileAsViewed,
  type PrFileViewedState,
  type PrFilesViewedState,
} from '../api/github.api'
import { useRepoGitHub } from './useRepoGitHub'

/** Per-file "reviewed" state for a PR (GitHub's Files Changed checkboxes), plus the toggle action.
 * `toggleViewed` flips the local SWR cache immediately — both the diff view's checkbox and the file
 * list's checkmark read from this same cache, so both update instantly — and rolls back
 * automatically if the GitHub mutation fails (SWR's `rollbackOnError`). */
export function usePrFilesViewedState(
  repoPath: string | null,
  prNumber: number | null
): {
  pullRequestId: string | null
  viewedByPath: Record<string, PrFileViewedState>
  isLoading: boolean
  isToggling: boolean
  toggleViewed: (path: string) => Promise<void>
} {
  const { ownerRepo, token } = useRepoGitHub(repoPath)
  const [isToggling, setIsToggling] = useState(false)

  const { data, isLoading, mutate } = useSWR(
    prNumber != null && ownerRepo && token
      ? ['pr-files-viewed', ownerRepo.owner, ownerRepo.repo, prNumber, token]
      : null,
    () =>
      fetchPrFilesViewedState(ownerRepo!.owner, ownerRepo!.repo, prNumber as number, token as string),
    { revalidateOnFocus: false }
  )

  async function toggleViewed(path: string) {
    if (!data || !token) return
    const wasViewed = data.viewedByPath[path] === 'VIEWED'
    const optimistic: PrFilesViewedState = {
      ...data,
      viewedByPath: { ...data.viewedByPath, [path]: wasViewed ? 'UNVIEWED' : 'VIEWED' },
    }

    setIsToggling(true)
    try {
      await mutate(
        async () => {
          if (wasViewed) {
            await unmarkPrFileAsViewed(data.pullRequestId, path, token)
          } else {
            await markPrFileAsViewed(data.pullRequestId, path, token)
          }
          // The mutation already confirmed the new state — no need to re-fetch the whole list.
          return optimistic
        },
        { optimisticData: optimistic, rollbackOnError: true, revalidate: false }
      )
    } finally {
      setIsToggling(false)
    }
  }

  return {
    pullRequestId: data?.pullRequestId ?? null,
    viewedByPath: data?.viewedByPath ?? {},
    isLoading,
    isToggling,
    toggleViewed,
  }
}
