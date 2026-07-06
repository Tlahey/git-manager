import type { AppNotification } from '../../stores/notification.store'
import { getNotificationTypeDef } from '../../lib/notifications/notificationRegistry'
import { DefaultIcon } from './NotificationIcons'
import type { TFunction } from '@git-manager/i18n'

// i18n keys follow the `notifications.types.<type>` / `notifications.messages.<type>` convention
// 1:1 with `AppNotification['type']` (packages/i18n/locales/*/common.json), so this only needs to
// template the key — not branch on it. `review_status_changed` is the one type whose message needs
// a pre-translated value (approved/changes_requested) rather than the raw status string.
export function getNotificationText(notif: AppNotification, t: TFunction) {
  const statusText =
    notif.reviewStatus === 'approved'
      ? t('notifications.status.approved')
      : notif.reviewStatus === 'changes_requested'
      ? t('notifications.status.changes_requested')
      : notif.reviewStatus || ''

  return {
    title: t(`notifications.types.${notif.type}`, { number: notif.prNumber }),
    message: t(`notifications.messages.${notif.type}`, {
      number: notif.prNumber,
      title: notif.prTitle,
      repo: notif.repo,
      author: notif.author,
      status: statusText,
    }),
  }
}

// Icon mapper for notifications
export function getNotificationIcon(type: AppNotification['type']) {
  const Icon = getNotificationTypeDef(type)?.icon ?? DefaultIcon
  return <Icon />
}

