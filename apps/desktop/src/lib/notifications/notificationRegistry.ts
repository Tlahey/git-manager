import type { ComponentType } from 'react'
import type { AppNotification, PreviousPRSnapshot } from '../../stores/notification.store'
import type { NotificationScopeKey, NotificationSettings } from '@git-manager/git-types'
import { isAuthoredByCurrentUser, resolveNotificationScope } from './notificationScope'
import type { MockPR, PRStatus, ReviewStatus } from '../github/types'
import {
  ReviewRequestedIcon,
  PrGreenIcon,
  PrRedIcon,
  PrMergedIcon,
  PrClosedIcon,
  PrQueuedIcon,
  NewPrIcon,
} from '../../components/notification/NotificationIcons'

export type { PreviousPRSnapshot }

/**
 * A PR that reached its end state: nothing more can happen to it, so no step of the *review* or
 * *CI* pipeline should still raise a notification about it. Without this guard, merging a PR whose
 * checks are still finishing produces "PR merged" immediately followed by "CI failed" on a branch
 * that no longer exists.
 */
export function isTerminalStatus(status: PRStatus): boolean {
  return status === 'merged' || status === 'closed'
}

/**
 * kind → detection/build/display definition, the single place that knows about every concrete
 * notification type. `useNotificationWatcher.ts` loops over this array and never hand-branches on
 * `type` — adding a 9th type is purely additive (one entry here + one i18n key pair), same shape
 * as `lib/rewards/ruleRegistry.ts` (docs/architecture/17-notification-system-refactor-plan.md).
 *
 * These are plain data descriptors, not polymorphic classes: unlike the rewards engine's
 * `RewardRule`s, nothing here holds internal state or needs a `matches`/`track` method pair — a
 * typed array is enough, so that's all this is.
 *
 * Order follows the PR's own lifecycle (appears → review → CI → queued → merged/closed) so a poll
 * that catches several steps at once reads in the order they happened. The terminal pair sits last
 * and is mutually exclusive by construction: `merged` and `closed` are distinct `PRStatus` values
 * (a merged PR is *never* reported as closed — see `parsePRStatus` in `api/github.api.ts`).
 */
export interface NotificationTypeDef {
  type: AppNotification['type']
  /** Settings key gating this type; null = no dedicated toggle, follows `enabled` only. */
  settingsKey: keyof NotificationSettings | null
  /**
   * Settings key carrying this type's audience filter; null = the type has no scope and always
   * fires for every PR the app watches. See {@link NotificationScopeKey} for why
   * `review_requested` is the one PR type that opts out.
   */
  scopeKey: NotificationScopeKey | null
  targetTab: AppNotification['targetTab'] | ((pr: MockPR) => AppNotification['targetTab'])
  nativePrefix: string
  icon: ComponentType
  detect: (pr: MockPR, prev: PreviousPRSnapshot | undefined) => boolean
  reviewStatus?: (pr: MockPR) => ReviewStatus | undefined
}

export const NOTIFICATION_TYPES: NotificationTypeDef[] = [
  {
    type: 'new_pr',
    settingsKey: 'notifyOnNewPr',
    scopeKey: 'notifyOnNewPr',
    targetTab: (pr) => (pr.needsMyReview ? 'waiting' : 'prs'),
    nativePrefix: '🆕 [New PR] ',
    icon: NewPrIcon,
    // A PR first seen already merged or closed isn't news — it's history that just entered the
    // list (a filter change, a re-login, a cleared baseline).
    detect: (pr, prev) => !prev && !isTerminalStatus(pr.status),
  },
  {
    type: 'review_requested',
    settingsKey: 'notifyOnReviewRequested',
    // No scope: a review is never requested on your own PR, so "mine only" would silence this
    // type outright rather than narrow it.
    scopeKey: null,
    targetTab: 'waiting',
    nativePrefix: '👀 [Review] ',
    icon: ReviewRequestedIcon,
    detect: (pr, prev) =>
      !!prev && !!pr.needsMyReview && !prev.needsMyReview && !isTerminalStatus(pr.status),
  },
  {
    type: 'review_status_changed',
    settingsKey: 'notifyOnReviewStatusChanged',
    scopeKey: 'notifyOnReviewStatusChanged',
    targetTab: 'prs',
    nativePrefix: '💬 [Review Update] ',
    icon: ReviewRequestedIcon,
    detect: (pr, prev) =>
      !!prev &&
      pr.reviewStatus !== prev.reviewStatus &&
      (pr.reviewStatus === 'approved' || pr.reviewStatus === 'changes_requested') &&
      !isTerminalStatus(pr.status),
    reviewStatus: (pr) => pr.reviewStatus,
  },
  {
    type: 'ci_success',
    settingsKey: 'notifyOnCi',
    scopeKey: 'notifyOnCi',
    targetTab: 'prs',
    nativePrefix: '🟢 [CI Success] ',
    icon: PrGreenIcon,
    detect: (pr, prev) =>
      !!prev &&
      pr.ciStatus !== prev.ciStatus &&
      pr.ciStatus === 'success' &&
      !isTerminalStatus(pr.status),
  },
  {
    type: 'ci_failed',
    settingsKey: 'notifyOnCi',
    scopeKey: 'notifyOnCi',
    targetTab: 'prs',
    nativePrefix: '🔴 [CI Failed] ',
    icon: PrRedIcon,
    detect: (pr, prev) =>
      !!prev &&
      pr.ciStatus !== prev.ciStatus &&
      pr.ciStatus === 'failure' &&
      !isTerminalStatus(pr.status),
  },
  {
    type: 'pr_queued',
    settingsKey: 'notifyOnPrQueued',
    scopeKey: 'notifyOnPrQueued',
    targetTab: 'prs',
    nativePrefix: '⏳ [Queued] ',
    icon: PrQueuedIcon,
    // Auto-merge armed: the PR now merges on its own once the requirements are met (this is also
    // how a PR enters a repo's merge queue). The step between "green" and "merged".
    detect: (pr, prev) =>
      !!prev && !!pr.autoMerge && !prev.autoMerge && !isTerminalStatus(pr.status),
  },
  {
    type: 'pr_merged',
    settingsKey: 'notifyOnPrMerged',
    scopeKey: 'notifyOnPrMerged',
    targetTab: 'prs',
    nativePrefix: '🎉 [Merged] ',
    icon: PrMergedIcon,
    detect: (pr, prev) => !!prev && pr.status !== prev.status && pr.status === 'merged',
  },
  {
    type: 'pr_closed',
    // Reuses the same toggle as pr_merged — matches the pre-registry behavior exactly (there's no
    // dedicated "notify on close" setting today).
    settingsKey: 'notifyOnPrMerged',
    scopeKey: 'notifyOnPrMerged',
    targetTab: 'prs',
    nativePrefix: '🛑 [Closed] ',
    icon: PrClosedIcon,
    detect: (pr, prev) => !!prev && pr.status !== prev.status && pr.status === 'closed',
  },
]

export function getNotificationTypeDef(
  type: AppNotification['type']
): NotificationTypeDef | undefined {
  return NOTIFICATION_TYPES.find((d) => d.type === type)
}

export function resolveTargetTab(
  def: NotificationTypeDef,
  pr: MockPR
): AppNotification['targetTab'] {
  return typeof def.targetTab === 'function' ? def.targetTab(pr) : def.targetTab
}

export function isNotificationTypeEnabled(
  def: NotificationTypeDef,
  notifications: NotificationSettings | undefined
): boolean {
  if (def.settingsKey === null) return true
  return (notifications?.[def.settingsKey] as boolean | undefined) ?? true
}

/**
 * Whether this PR is in the audience the user chose for this type — the second gate, applied after
 * {@link isNotificationTypeEnabled}: the checkbox says *whether*, the scope says *whose*.
 *
 * An unknown `currentUser` lets everything through rather than nothing. Without a connected
 * account there is no author to compare against, and a filter that can't be evaluated must not
 * become a filter that drops every notification — the failure would be silent, and the symptom
 * ("notifications stopped") points nowhere near this line.
 */
export function isNotificationInScope(
  def: NotificationTypeDef,
  pr: MockPR,
  notifications: NotificationSettings | undefined,
  currentUser: string | null | undefined
): boolean {
  if (def.scopeKey === null) return true
  if (resolveNotificationScope(def.scopeKey, notifications) === 'all') return true
  if (!currentUser) return true
  return isAuthoredByCurrentUser(pr.author, currentUser)
}
