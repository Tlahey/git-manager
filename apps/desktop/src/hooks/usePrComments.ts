import useSWR from 'swr'
import {
  fetchPrComments,
  fetchPrReviewComments,
  type GhComment,
  type PrReviewState,
} from '../api/github.api'
import { useRepoGitHub } from './useRepoGitHub'
import { useGithubPollInterval } from './useGithubPollInterval'

/**
 * One entry of the conversation: either an issue-style comment or a submitted review's body.
 *
 * `key` rather than the raw id is what the list is keyed on — the two GitHub endpoints number their
 * rows independently, so an issue comment and a review can share an `id`.
 */
export interface PrTimelineComment extends GhComment {
  key: string
  /** Set only on a submitted review, so the card can label it Approved / Changes requested / … */
  reviewState?: PrReviewState
}

function byCreatedAt(a: PrTimelineComment, b: PrTimelineComment): number {
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
}

/**
 * The pull request's conversation. Manual refresh via `mutate` (the view has a refresh button) plus
 * a modest background interval so a freshly posted comment appears without a reload.
 *
 * `withReviews` folds the PR's **submitted reviews** into the same timeline. It is off by default
 * because this hook also backs the *issue* view, where `/pulls/:n/reviews` has no meaning — but it
 * must be on for a pull request: a bot reviewer such as Copilot posts its report as a review, not as
 * an issue comment, so a PR conversation without it is missing the entry github.com shows first.
 */
export function usePrComments(
  repoPath: string | null,
  prNumber: number | null,
  options: { withReviews?: boolean } = {}
): {
  comments: PrTimelineComment[]
  isLoading: boolean
  error: unknown
  refresh: () => void
} {
  const { withReviews = false } = options
  const { ownerRepo, accountId } = useRepoGitHub(repoPath)

  const refreshInterval = useGithubPollInterval(60_000, accountId, 'core')

  const { data, isLoading, error, mutate } = useSWR(
    prNumber != null && ownerRepo && accountId
      ? ['pr-comments', ownerRepo.owner, ownerRepo.repo, prNumber, accountId, withReviews]
      : null,
    async () => {
      const owner = ownerRepo!.owner
      const repo = ownerRepo!.repo
      const number = prNumber as number
      const account = accountId as string

      const [issueComments, reviews] = await Promise.all([
        fetchPrComments(owner, repo, number, account),
        withReviews ? fetchPrReviewComments(owner, repo, number, account) : Promise.resolve([]),
      ])

      const timeline: PrTimelineComment[] = [
        ...issueComments.map((c) => ({ ...c, key: `comment-${c.id}` })),
        ...reviews.map((r) => ({ ...r, key: `review-${r.id}`, reviewState: r.state })),
      ]
      return timeline.sort(byCreatedAt)
    },
    { revalidateOnFocus: false, refreshInterval }
  )

  return { comments: data ?? [], isLoading, error, refresh: () => void mutate() }
}
