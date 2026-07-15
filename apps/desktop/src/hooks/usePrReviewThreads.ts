import useSWR from 'swr'
import { fetchPrReviewThreads, type PrReviewThread } from '../api/github.api'
import { useRepoGitHub } from './useRepoGitHub'

/** Unresolved review threads (open inline comments / suggestions) on a PR — the "code suggestions"
 * still needing attention. Refetches on a modest interval so a newly resolved thread drops off. */
export function usePrReviewThreads(
  repoPath: string | null,
  prNumber: number | null
): { threads: PrReviewThread[]; isLoading: boolean; refresh: () => void } {
  const { ownerRepo, token } = useRepoGitHub(repoPath)

  const { data, isLoading, mutate } = useSWR(
    prNumber != null && ownerRepo && token
      ? ['pr-review-threads', ownerRepo.owner, ownerRepo.repo, prNumber, token]
      : null,
    () => fetchPrReviewThreads(ownerRepo!.owner, ownerRepo!.repo, prNumber as number, token as string),
    { revalidateOnFocus: false, refreshInterval: 60_000 }
  )

  return { threads: data ?? [], isLoading, refresh: () => void mutate() }
}
