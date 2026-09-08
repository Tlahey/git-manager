import type { GhUser, PrReviewer, PrReviewSummary } from '../api/github.api'

/**
 * The reviewers of one pull request, from the two sources that each hold half the answer.
 *
 * GitHub's REST payload (`requested_reviewers`) lists only the people whose review is *still
 * outstanding* — submitting a review takes you off it. So a PR where everyone has already reviewed
 * has an empty `requested_reviewers`, and a panel built on it alone shows nothing precisely when
 * there is the most to show. The GraphQL summary (`fetchPrReviewSummary`) is the complete list:
 * one row per reviewer, latest verdict wins, pending requests appended.
 *
 * The summary is therefore what is displayed, and `requested` only fills in for it: while the
 * lazier GraphQL call is in flight, when it failed, or when it is off entirely (no token, no GitHub
 * remote). Anyone it names who is not already in the summary is pending by definition — the summary
 * would have carried their verdict otherwise.
 */
export function resolvePrReviewers(
  summary: PrReviewSummary | undefined,
  requested: GhUser[] | undefined
): PrReviewer[] {
  const reviewers = [...(summary?.reviewers ?? [])]
  for (const user of requested ?? []) {
    if (!user.login || reviewers.some((r) => r.login === user.login)) continue
    reviewers.push({ login: user.login, avatarUrl: user.avatar_url, state: 'PENDING' })
  }
  return reviewers
}
