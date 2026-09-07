import useSWR from 'swr'
import { fetchPrReviewThreads, type PrReviewThread } from '../api/github.api'
import { useRepoGitHub } from './useRepoGitHub'
import { useGithubPollInterval } from './useGithubPollInterval'

/** Unresolved review threads (open inline comments / suggestions) on a PR — the "code suggestions"
 * still needing attention. Refetches on a modest interval so a newly resolved thread drops off. */
export function usePrReviewThreads(
  repoPath: string | null,
  prNumber: number | null
): { threads: PrReviewThread[]; isLoading: boolean; refresh: () => void } {
  const { ownerRepo, accountId } = useRepoGitHub(repoPath)

  const refreshInterval = useGithubPollInterval(60_000, accountId, 'graphql')

  const { data, isLoading, mutate } = useSWR(
    prNumber != null && ownerRepo && accountId
      ? ['pr-review-threads', ownerRepo.owner, ownerRepo.repo, prNumber, accountId]
      : null,
    () =>
      fetchPrReviewThreads(
        ownerRepo!.owner,
        ownerRepo!.repo,
        prNumber as number,
        accountId as string
      ),
    { revalidateOnFocus: false, refreshInterval }
  )

  return { threads: data ?? [], isLoading, refresh: () => void mutate() }
}
