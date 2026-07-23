import type { MockPR } from './types'

/** Every GitHub action a PR row's split button can offer. The row assembles labelled/icon'd
 * `SplitButtonAction`s from these; the primary is picked by {@link defaultPrActionKey}. `review`/
 * `view` both open the embedded PR panel — they differ only in labelling (a review you owe vs. a
 * plain look). Pin and snooze are deliberately NOT here: they live as hover icons on the row's left
 * edge (see `SnoozeControl` and the pin button in `PRRow`), not in this menu. */
export type PrActionKey =
  | 'review'
  | 'view'
  | 'merge'
  | 'close'
  | 'openGitHub'
  | 'viewRepo'
  | 'copyLink'

/** Whether merging this PR from the app is offered: it must be your own, still open (not draft),
 * not behind its base, and its CI must not be failing or still running (no CI at all is fine — many
 * repos have none). Mirrors the guards GitHub itself would apply. */
export function canMergePr(pr: MockPR, currentUser: string | null): boolean {
  const isOwn = !!currentUser && pr.author === currentUser
  const isOpen =
    pr.status === 'open' || pr.status === 'approved' || pr.status === 'changes_requested'
  const ciNotBlocking = pr.ciStatus !== 'failure' && pr.ciStatus !== 'running'
  return isOwn && isOpen && !pr.isDraft && ciNotBlocking && !pr.needsRebase
}

/**
 * The state-dependent default action shown on the split button's primary segment:
 * - closed/merged PRs can only be re-opened on GitHub,
 * - a review you owe leads with **Review**,
 * - your own mergeable PR leads with **Merge**,
 * - everything else leads with a plain **View**.
 */
export function defaultPrActionKey(pr: MockPR, currentUser: string | null): PrActionKey {
  if (pr.status === 'merged' || pr.status === 'closed') return 'openGitHub'
  if (pr.needsMyReview) return 'review'
  if (canMergePr(pr, currentUser)) return 'merge'
  return 'view'
}
