import type { PullRequest } from '@git-manager/git-types'

/**
 * Compact status a branch/worktree PR tag can be in. Derived from the PR's `state` + `ciStatus`
 * (the only signals GitHub gives us today) rather than a single field — GitHub's real "merge
 * queue" state isn't exposed over the current IPC surface, so a PR whose checks are still running
 * (`pending`) is surfaced as `pending` (the closest available "queued/in-progress" signal).
 */
export type PrTagStatus = 'open' | 'merged' | 'failed' | 'pending' | 'draft' | 'closed'

/** Reduce a PR to the single status shown on its branch/worktree tag. */
export function derivePrTagStatus(pr: PullRequest): PrTagStatus {
  if (pr.state === 'merged') return 'merged'
  if (pr.state === 'closed') return 'closed'
  if (pr.state === 'draft' || pr.isDraft) return 'draft'
  if (pr.ciStatus === 'failure') return 'failed'
  if (pr.ciStatus === 'pending') return 'pending'
  return 'open'
}

/** i18n key (in the `git` namespace) for a status' short human label, used in the tag's aria-label. */
export const PR_TAG_STATUS_LABEL_KEY: Record<PrTagStatus, string> = {
  open: 'sidebar.prTag.status.open',
  merged: 'sidebar.prTag.status.merged',
  failed: 'sidebar.prTag.status.failed',
  pending: 'sidebar.prTag.status.pending',
  draft: 'sidebar.prTag.status.draft',
  closed: 'sidebar.prTag.status.closed',
}
