import type { PullRequest } from '@git-manager/git-types'
import { PR_GROUP_ORDER, type PrGroupKey } from './types'

export interface PrGroup {
  key: PrGroupKey
  prs: PullRequest[]
}

/**
 * Split the repo's pull requests into the sidebar's four buckets.
 *
 * The buckets overlap on purpose — `all` holds every PR, and a PR you opened that is also assigned
 * to you appears under both `mine` and `assigned` — so the group counts don't sum to the section
 * count. That mirrors GitHub's own dashboard filters, which are views over one list rather than a
 * partition of it.
 *
 * Without a signed-in user only `all` can be resolved (the other three are all defined relative to
 * "me"), so the three personal buckets come back empty rather than guessing.
 */
export function groupPullRequests(prs: PullRequest[], currentUser?: string): PrGroup[] {
  const byKey: Record<PrGroupKey, PullRequest[]> = {
    mine: [],
    assigned: [],
    awaitingReview: [],
    all: prs,
  }

  if (currentUser) {
    for (const pr of prs) {
      if (pr.author === currentUser) byKey.mine.push(pr)
      if (pr.assignees.some((a) => a.login === currentUser)) byKey.assigned.push(pr)
      // "Awaiting my review" is a request still outstanding: GitHub removes the requested-reviewer
      // entry once that review lands, so a PR the user already reviewed drops out on its own. Your
      // own PR never counts — GitHub doesn't let you review it.
      if (pr.author !== currentUser && pr.requestedReviewers.some((r) => r.login === currentUser)) {
        byKey.awaitingReview.push(pr)
      }
    }
  }

  return PR_GROUP_ORDER.map((key) => ({ key, prs: byKey[key] }))
}
