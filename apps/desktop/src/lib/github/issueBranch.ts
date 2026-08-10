/**
 * Naming and matching rules tying a GitHub issue to a local branch.
 *
 * Lives here rather than in `features/launchpad` because the branch↔issue link is read on both
 * sides of the app: the Launchpad rows offer "Create a branch", and the graph's sidebar shows an
 * issue as already-linked when a local branch references its number.
 */

import type { MockIssue } from './types'

/** Branch name suggested when creating a local branch from an issue, e.g. `312-tab-close-button`.
 * The title is slugified and capped so the ref stays short; falls back to just the number. */
export function issueBranchName(issue: Pick<MockIssue, 'number' | 'title'>): string {
  const slug = issue.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return slug ? `${issue.number}-${slug}` : `${issue.number}`
}

/** Whether a local branch name references the given issue number as a standalone token — so branch
 * `312-fix` matches issue 312 but not issue 31 or 3123. Used to show a linked-branch tag on the row
 * instead of the "Create a branch" button. */
export function branchMatchesIssue(branchName: string, issueNumber: number): boolean {
  return new RegExp(`(^|[^0-9])${issueNumber}([^0-9]|$)`).test(branchName)
}
