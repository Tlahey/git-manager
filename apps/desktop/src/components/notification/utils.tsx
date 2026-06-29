import { Eye, MessageSquare, Check, X, Bell } from 'lucide-react'
import type { AppNotification } from '../../stores/notification.store'

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
      return (
        <div className="flex h-7 w-7 items-center justify-center rounded bg-green-500/15 text-green-400 ring-1 ring-green-500/20">
          <Check className="h-4 w-4" />
        </div>
      )
    case 'pr_closed':
      return (
        <div className="flex h-7 w-7 items-center justify-center rounded bg-destructive/15 text-destructive ring-1 ring-destructive/20">
          <X className="h-4 w-4" />
        </div>
      )
    case 'review_requested':
      return (
        <div className="flex h-7 w-7 items-center justify-center rounded bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20">
          <Eye className="h-4 w-4" />
        </div>
      )
    case 'review_status_changed':
      return (
        <div className="flex h-7 w-7 items-center justify-center rounded bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20">
          <MessageSquare className="h-4 w-4" />
        </div>
      )
    default:
      return (
        <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/15 text-primary ring-1 ring-primary/20">
          <Bell className="h-4 w-4" />
        </div>
      )
  }
}
