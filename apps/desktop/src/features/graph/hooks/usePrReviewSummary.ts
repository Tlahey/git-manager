import useSWR from 'swr'
import { fetchPrReviewSummary, type PrReviewSummary } from '../../../api/github.api'
import { useRepoGitHub } from '../../../hooks/useRepoGitHub'

export interface UsePrReviewSummaryResult {
  summary: PrReviewSummary | undefined
  isLoading: boolean
  error: unknown
}

/**
 * Reviewers / approvals / checks state for one pull request, fetched **lazily**.
 *
 * `enabled` is the whole point: this backs the sidebar's hover card, and the sidebar can list
 * dozens of PRs. Fetching for all of them up front would be dozens of GraphQL calls for data the
 * user may never look at, so the request only fires once a row is actually hovered. SWR then caches
 * it per PR, so hovering the same row again is instant and re-hovering costs nothing within the
 * deduping window.
 */
export function usePrReviewSummary(
  repoPath: string | null,
  prNumber: number | null,
  enabled: boolean
): UsePrReviewSummaryResult {
  const { ownerRepo, token } = useRepoGitHub(repoPath)

  const { data, isLoading, error } = useSWR(
    enabled && prNumber != null && ownerRepo && token
      ? ['pr-review-summary', ownerRepo.owner, ownerRepo.repo, prNumber, token]
      : null,
    ([, owner, repo, number, tok]) => fetchPrReviewSummary(owner, repo, number, tok),
    {
      revalidateOnFocus: false,
      // A review or a check landing isn't urgent enough to re-poll a card that is only on screen
      // while the pointer rests on the row; the next hover after the window revalidates anyway.
      dedupingInterval: 30_000,
    }
  )

  return { summary: data, isLoading, error }
}
