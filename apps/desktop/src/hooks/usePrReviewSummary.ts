import useSWR from 'swr'
import { fetchPrReviewSummary, type PrReviewSummary } from '../api/github.api'
import { useRepoGitHub } from './useRepoGitHub'
import { useGithubPollInterval } from './useGithubPollInterval'

export interface UsePrReviewSummaryResult {
  summary: PrReviewSummary | undefined
  isLoading: boolean
  error: unknown
}

/**
 * Reviewers / approvals / checks state for one pull request, fetched **lazily**.
 *
 * `enabled` is the whole point for the sidebar's hover card, which is what this was written for: the
 * sidebar can list dozens of PRs, and fetching for all of them up front would be dozens of GraphQL
 * calls for data the user may never look at, so the request only fires once a row is actually
 * hovered. SWR then caches it per PR, so hovering the same row again is instant and re-hovering
 * costs nothing within the deduping window.
 *
 * `pollMs` is off by default for that same reason — a review or a check landing isn't urgent enough
 * to re-poll a card that is only on screen while the pointer rests on the row. A long-lived surface
 * (the PR detail panel) passes an interval, and gets it throttled with every other GitHub poll via
 * {@link useGithubPollInterval}.
 */
export function usePrReviewSummary(
  repoPath: string | null,
  prNumber: number | null,
  enabled: boolean,
  pollMs = 0
): UsePrReviewSummaryResult {
  const { ownerRepo, accountId } = useRepoGitHub(repoPath)

  const refreshInterval = useGithubPollInterval(pollMs, accountId, 'graphql')

  const { data, isLoading, error } = useSWR(
    enabled && prNumber != null && ownerRepo && accountId
      ? ['pr-review-summary', ownerRepo.owner, ownerRepo.repo, prNumber, accountId]
      : null,
    ([, owner, repo, number, tok]) => fetchPrReviewSummary(owner, repo, number, tok),
    {
      revalidateOnFocus: false,
      dedupingInterval: 30_000,
      refreshInterval,
    }
  )

  return { summary: data, isLoading, error }
}
