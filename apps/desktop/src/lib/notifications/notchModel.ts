/**
 * Turns a bell notification into a card `@git-manager/notch` can render.
 *
 * This is the whole adapter layer between the app's domain and the notch package, and it exists so
 * the package can stay ignorant of pull requests. Everything the card needs is resolved *here*:
 * the copy is translated, the tone is chosen, the actions are named. What crosses the boundary is
 * plain data that survives `JSON.stringify` — which it has to, because the card is rendered in a
 * separate webview whose content travels in its URL.
 *
 * A second producer (a git hook, a running task) writes its own function next to this one and
 * reuses the same window; it does not need an `AppNotification` to do it.
 */

import type { NotchEventModel, NotchTone } from '@git-manager/notch'
import type { TFunction } from '@git-manager/i18n'
import type { NativeNotificationSpec } from '../../api/notification.api'
import type { AppNotification } from '../../stores/notification.store'
import { useSettingsStore } from '../../stores/settings.store'
import { getNotificationText } from '../../components/notification/utils'
import { getNotificationTypeDef } from './notificationRegistry'
import { formatRelativeTimestamp } from '../relativeDate'
import { buildNotificationRoute } from './notificationRoute'
import type { NotchRequest } from './notchDelivery'

/**
 * Which halo each notification type wears.
 *
 * Deliberately not the same palette as the type's own icon badge: the badge is a small permanent
 * per-type accent, while the halo is a glanceable "what kind of thing just happened" signal you
 * can read from across the room. The seven tones carry the exact colours the per-type palette used
 * before it was generalised, so nothing changed appearance in the move.
 */
export const NOTIFICATION_TONES: Record<AppNotification['type'], NotchTone> = {
  review_requested: 'accent',
  review_status_changed: 'accent',
  new_pr: 'info',
  ci_success: 'success',
  ci_failed: 'error',
  pr_merged: 'highlight',
  pr_closed: 'error',
  pr_queued: 'info',
}

/** Up to two letters for the avatar fallback, punctuation stripped (`github-actions` → `GI`). */
export function authorInitials(author: string): string {
  const letters = author.replace(/[^\p{L}\p{N}]/gu, '')
  return letters.slice(0, 2).toUpperCase() || '?'
}

/**
 * The card for one notification.
 *
 * `getNotificationText`'s `message` is deliberately unused: it is a sentence templating the
 * repo/title/author back together, and this layout already shows each of them as its own field.
 */
export function notchModelFromNotification(
  notif: AppNotification,
  t: TFunction
): NotchEventModel {
  const { title } = getNotificationText(notif, t)

  return {
    kind: 'event',
    // The PR's own id, so a second notification about the *same* pull request coalesces onto the
    // card already showing instead of queueing behind it.
    id: `pr-${notif.prId}-${notif.type}`,
    tone: NOTIFICATION_TONES[notif.type] ?? 'neutral',
    eyebrow: title,
    context: notif.fullName ?? notif.repo,
    meta: formatRelativeTimestamp(notif.createdAt, t),
    title: notif.prTitle,
    subtitle: `@${notif.author}`,
    avatar: {
      ...(notif.authorAvatar ? { src: notif.authorAvatar } : {}),
      alt: notif.author,
      fallback: authorInitials(notif.author),
    },
    badge: `#${notif.prNumber}`,
    actions: [
      {
        id: 'activate',
        label: t('notifications.popover.openInApp'),
        variant: 'primary',
      },
      // "GitHub" is a proper noun — untranslated, like the rest of the app's toolbars. Only
      // offered when there is somewhere to go.
      ...(notif.url ? [{ id: 'open-external', label: 'GitHub' }] : []),
    ],
  }
}

/**
 * The same notification as an OS banner.
 *
 * One place rather than two, because this is both what the `native` display style sends and what
 * the notch falls back to when its window can't be shown — and a banner that differed between
 * those two paths would be a bug nobody would ever notice.
 */
export function nativeSpecFromNotification(
  notif: AppNotification,
  t: TFunction
): NativeNotificationSpec {
  const { title, message } = getNotificationText(notif, t)
  const notifications = useSettingsStore.getState().settings.notifications
  const soundEnabled = notifications?.enableSound ?? false
  const soundName = notifications?.soundName ?? 'default'
  const prefix = getNotificationTypeDef(notif.type)?.nativePrefix ?? 'ℹ️ '

  return {
    title: `${prefix}${title}`,
    body: message,
    ...(soundEnabled ? { sound: soundName } : {}),
    route: buildNotificationRoute(notif),
  }
}

/**
 * Everything the delivery pipeline needs for one notification: the card, where it can go, and how
 * to say the same thing as a banner if it can't go to the notch.
 *
 * Every bell notification is `key`. They are all discrete things the user explicitly asked to be
 * told about, so choosing the macOS banner changes nothing about which of *these* are raised — the
 * `ambient` half of the scale is for the cards this app doesn't produce yet (progress, background
 * tasks), which is exactly the coverage the notch buys.
 */
export function notchRequestFromNotification(notif: AppNotification, t: TFunction): NotchRequest {
  return {
    model: notchModelFromNotification(notif, t),
    importance: 'key',
    iconId: notif.type,
    route: buildNotificationRoute(notif),
    ...(notif.url ? { externalUrl: notif.url } : {}),
    nativeFallback: nativeSpecFromNotification(notif, t),
  }
}
