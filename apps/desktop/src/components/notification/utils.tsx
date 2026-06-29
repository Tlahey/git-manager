import type { AppNotification } from '../../stores/notification.store'
import {
  ReviewRequestedIcon,
  PrGreenIcon,
  PrRedIcon,
  PrMergedIcon,
  PrClosedIcon,
  NewPrIcon,
  DefaultIcon,
} from './NotificationIcons'

// Helper to translate notification texts
export function getNotificationText(notif: AppNotification, t: any) {
  switch (notif.type) {
    case 'pr_merged':
      return {
        title: t('notifications.types.pr_merged', { number: notif.prNumber }),
        message: t('notifications.messages.pr_merged', {
          number: notif.prNumber,
          title: notif.prTitle,
          repo: notif.repo,
        }),
      }
    case 'pr_closed':
      return {
        title: t('notifications.types.pr_closed', { number: notif.prNumber }),
        message: t('notifications.messages.pr_closed', {
          number: notif.prNumber,
          title: notif.prTitle,
          repo: notif.repo,
        }),
      }
    case 'review_requested':
      return {
        title: t('notifications.types.review_requested', { number: notif.prNumber }),
        message: t('notifications.messages.review_requested', {
          number: notif.prNumber,
          author: notif.author,
          title: notif.prTitle,
        }),
      }
    case 'review_status_changed': {
      const statusText =
        notif.reviewStatus === 'approved'
          ? t('notifications.status.approved')
          : notif.reviewStatus === 'changes_requested'
          ? t('notifications.status.changes_requested')
          : notif.reviewStatus || ''
      return {
        title: t('notifications.types.review_status_changed', { number: notif.prNumber }),
        message: t('notifications.messages.review_status_changed', {
          number: notif.prNumber,
          title: notif.prTitle,
          status: statusText,
        }),
      }
    }
    case 'new_pr':
      return {
        title: t('notifications.types.new_pr', { number: notif.prNumber }),
        message: t('notifications.messages.new_pr', {
          number: notif.prNumber,
          title: notif.prTitle,
          author: notif.author,
          repo: notif.repo,
        }),
      }
    case 'ci_success':
      return {
        title: t('notifications.types.ci_success', { number: notif.prNumber }),
        message: t('notifications.messages.ci_success', {
          number: notif.prNumber,
          title: notif.prTitle,
          repo: notif.repo,
        }),
      }
    case 'ci_failed':
      return {
        title: t('notifications.types.ci_failed', { number: notif.prNumber }),
        message: t('notifications.messages.ci_failed', {
          number: notif.prNumber,
          title: notif.prTitle,
          repo: notif.repo,
        }),
      }
    default:
      return {
        title: t('notifications.title'),
        message: notif.prTitle,
      }
  }
}

// Icon mapper for notifications
export function getNotificationIcon(type: string) {
  switch (type) {
    case 'pr_merged':
      return <PrMergedIcon />
    case 'pr_closed':
      return <PrClosedIcon />
    case 'review_requested':
      return <ReviewRequestedIcon />
    case 'review_status_changed':
      return <ReviewRequestedIcon />
    case 'new_pr':
      return <NewPrIcon />
    case 'ci_success':
      return <PrGreenIcon />
    case 'ci_failed':
      return <PrRedIcon />
    default:
      return <DefaultIcon />
  }
}

