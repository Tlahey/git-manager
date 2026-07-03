import type { ComponentType } from 'react'
import type { AppNotification } from '../../stores/notification.store'
import type { NotificationSettings } from '@git-manager/git-types'
import type { MockPR, ReviewStatus } from '../../app/pull-requests/types'
import {
  ReviewRequestedIcon,
  PrGreenIcon,
  PrRedIcon,
  PrMergedIcon,
  PrClosedIcon,
  NewPrIcon,
} from '../../components/notification/NotificationIcons'

export interface PreviousPRSnapshot {
  status: MockPR['status']
  reviewStatus: ReviewStatus
  needsMyReview: boolean
  ciStatus?: MockPR['ciStatus']
  updatedAt: string
}

/**
 * kind → detection/build/display definition, the single place that knows about every concrete
 * notification type. `useNotificationWatcher.ts` loops over this array and never hand-branches on
 * `type` — adding an 8th type is purely additive (one entry here + one i18n key pair), same shape
 * as `lib/rewards/ruleRegistry.ts` (docs/architecture/17-notification-system-refactor-plan.md).
 *
 * These are plain data descriptors, not polymorphic classes: unlike the rewards engine's
 * `RewardRule`s, nothing here holds internal state or needs a `matches`/`track` method pair — a
 * typed array is enough, so that's all this is.
 */
export interface NotificationTypeDef {
  type: AppNotification['type']
  /** Settings key gating this type; null = no dedicated toggle, follows `enabled` only. */
  settingsKey: keyof NotificationSettings | null
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
    targetTab: (pr) => (pr.needsMyReview ? 'waiting' : 'prs'),
    nativePrefix: '🆕 [New PR] ',
    icon: NewPrIcon,
    detect: (_pr, prev) => !prev,
  },
  {
    type: 'pr_merged',
    settingsKey: 'notifyOnPrMerged',
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
    targetTab: 'prs',
    nativePrefix: '🛑 [Closed] ',
    icon: PrClosedIcon,
    detect: (pr, prev) => !!prev && pr.status !== prev.status && pr.status === 'closed',
  },
  {
    type: 'review_requested',
    settingsKey: 'notifyOnReviewRequested',
    targetTab: 'waiting',
    nativePrefix: '👀 [Review] ',
    icon: ReviewRequestedIcon,
    detect: (pr, prev) => !!prev && !!pr.needsMyReview && !prev.needsMyReview,
  },
  {
    type: 'review_status_changed',
    settingsKey: 'notifyOnReviewStatusChanged',
    targetTab: 'prs',
    nativePrefix: '💬 [Review Update] ',
    icon: ReviewRequestedIcon,
    detect: (pr, prev) =>
      !!prev &&
      pr.reviewStatus !== prev.reviewStatus &&
      pr.reviewStatus !== 'pending' &&
      (pr.reviewStatus === 'approved' || pr.reviewStatus === 'changes_requested'),
    reviewStatus: (pr) => pr.reviewStatus,
  },
  {
    type: 'ci_success',
    settingsKey: null,
    targetTab: 'prs',
    nativePrefix: '🟢 [CI Success] ',
    icon: PrGreenIcon,
    detect: (pr, prev) => !!prev && pr.ciStatus !== prev.ciStatus && pr.ciStatus === 'success',
  },
  {
    type: 'ci_failed',
    settingsKey: null,
    targetTab: 'prs',
    nativePrefix: '🔴 [CI Failed] ',
    icon: PrRedIcon,
    detect: (pr, prev) => !!prev && pr.ciStatus !== prev.ciStatus && pr.ciStatus === 'failure',
  },
]

export function getNotificationTypeDef(type: AppNotification['type']): NotificationTypeDef | undefined {
  return NOTIFICATION_TYPES.find((d) => d.type === type)
}

export function resolveTargetTab(def: NotificationTypeDef, pr: MockPR): AppNotification['targetTab'] {
  return typeof def.targetTab === 'function' ? def.targetTab(pr) : def.targetTab
}

export function isNotificationTypeEnabled(
  def: NotificationTypeDef,
  notifications: NotificationSettings | undefined
): boolean {
  if (def.settingsKey === null) return true
  return (notifications?.[def.settingsKey] as boolean | undefined) ?? true
}
