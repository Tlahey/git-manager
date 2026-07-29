import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { sendNativeNotification } from '../lib/tauri'
import type { NotificationRoute } from '../lib/notifications/notificationRoute'

/** Event the backend emits when the user clicks a notification. Mirrors `commands/notification.rs`. */
const NOTIFICATION_ACTIVATED_EVENT = 'notification://activated'

export interface NativeNotificationSpec {
  title: string
  body: string
  /** macOS system sound name; omit for a silent notification. */
  sound?: string
  /** Where clicking the notification takes the user. */
  route: NotificationRoute
}

/**
 * Shows an OS notification that deep-links back into the app when clicked.
 *
 * Failures are swallowed: a notification is an aside, and the two ways this can fail — no Tauri
 * host (tests, browser dev) and the OS refusing delivery — are both things the caller has nothing
 * useful to do about. It must not take down the action that raised the notification.
 */
export async function apiSendNativeNotification(spec: NativeNotificationSpec): Promise<void> {
  try {
    await sendNativeNotification(spec)
  } catch (e) {
    console.warn('Failed to display native notification:', e)
  }
}

/**
 * Subscribes to notification clicks. The payload is the `route` the notification was sent with —
 * feed it to `routeNotification` (see `lib/notifications/notificationRouting.ts`).
 */
export async function apiOnNotificationActivated(
  handler: (route: NotificationRoute) => void
): Promise<UnlistenFn> {
  return listen<NotificationRoute>(NOTIFICATION_ACTIVATED_EVENT, (event) => handler(event.payload))
}
