import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import {
  clearWindowBackdrop,
  getTrayIconRect,
  playSystemSound,
  raiseAboveMenuBar,
  sendNativeNotification,
  type TrayIconRect,
} from '../lib/tauri'
import type { NotificationRoute } from '../lib/notifications/notificationRoute'

/**
 * Event the backend emits when the user clicks a notification. Mirrors `commands/notification.rs`.
 * Exported so the notification popover window (a separate webview) can `emit` this same event
 * itself on click, reusing the main window's existing listener instead of a second pipeline.
 */
export const NOTIFICATION_ACTIVATED_EVENT = 'notification://activated'

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

/**
 * The tray icon's current on-screen rect, or `null` when it isn't available (e.g. Linux) — the
 * caller's cue to fall back to {@link apiSendNativeNotification} instead of a popover it can't anchor.
 */
export async function apiGetTrayIconRect(): Promise<TrayIconRect | null> {
  return getTrayIconRect()
}

/** Plays a named macOS system sound (e.g. `'Pop'`) standalone. Failures are swallowed — sound is decoration. */
export async function apiPlaySystemSound(name: string): Promise<void> {
  try {
    await playSystemSound(name)
  } catch (e) {
    console.warn('Failed to play system sound:', e)
  }
}

/**
 * Raises the notification popover above the macOS menu bar. Failures are swallowed — the popover
 * still works, just tucked under the menu bar like a normal window, which is an acceptable (if
 * less flashy) fallback.
 */
export async function apiRaiseAboveMenuBar(): Promise<void> {
  try {
    await raiseAboveMenuBar()
  } catch (e) {
    console.warn('Failed to raise notification popover above the menu bar:', e)
  }
}

/**
 * Clears the popover window's WKWebView backdrop, so the transparent margin around its card is
 * really transparent (and its rounded corners are really rounded) rather than an opaque
 * rectangle. Failures are swallowed: the popover still shows, just as a hard-edged box.
 */
export async function apiClearWindowBackdrop(): Promise<void> {
  try {
    await clearWindowBackdrop()
  } catch (e) {
    console.warn('Failed to clear the notification popover backdrop:', e)
  }
}
