import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { NotchModel } from '@git-manager/notch'
import {
  clearWindowBackdrop,
  getNotchMetrics,
  getTrayIconRect,
  isAppActive,
  makeWindowNonactivating,
  navigateWindow,
  playSystemSound,
  raiseAboveMenuBar,
  sendNativeNotification,
  showWithoutActivating,
  type NotchMetrics,
  type TrayIconRect,
} from '../lib/tauri'
import type { NotificationRoute } from '../lib/notifications/notificationRoute'

/**
 * Event the backend emits when the user clicks a notification. Mirrors `commands/notification.rs`.
 * Exported so the notification popover window (a separate webview) can `emit` this same event
 * itself on click, reusing the main window's existing listener instead of a second pipeline.
 */
export const NOTIFICATION_ACTIVATED_EVENT = 'notification://activated'

/**
 * Emitted by the notch window for any action it can't perform itself.
 *
 * The window handles exactly two ids on its own — `activate` (follow the card's route) and
 * `open-external` (open its URL) — because those are the only two that need nothing but the
 * payload. Everything a future producer invents ("Show output" on a failed hook, "Restart" on a
 * dead dev server) needs the stores and the router, which live in the main window; this is how it
 * gets there without every new kind of card editing `NotchWindow.tsx`.
 */
export const NOTCH_ACTION_EVENT = 'notch://action'

export interface NotchActionPayload {
  actionId: string
  /** The `model.id` of the card the action came from, so a late event can't be applied to the
   *  card that replaced it. */
  notchId: string
}

/**
 * Emitted by the notch window as it closes itself — a timer running out, the ✕, a click away.
 *
 * The queue lives in the main window (the notch window is transient and dies with its card), so
 * this is how it learns the slot is free and promotes whatever was waiting. Without it a queue
 * would stall on its first card forever.
 */
export const NOTCH_DISMISSED_EVENT = 'notch://dismissed'

export interface NotchDismissedPayload {
  notchId: string
}

/**
 * Sent to the notch window to replace the card it is showing, in place.
 *
 * The window's content is baked into its URL at creation, which is what avoids a race between the
 * window mounting and its content arriving — but it also means an update has nowhere to go. This
 * is that channel, and it is what makes the queue's coalescing real rather than nominal: a
 * progress tick re-enqueues the same id, and the card on screen changes instead of being torn down
 * and rebuilt (which would restart its entrance animation on every frame of progress).
 */
export const NOTCH_UPDATE_EVENT = 'notch://update'

export interface NotchUpdatePayload {
  model: NotchModel
}

/** Reports an action the notch window could not perform itself. Called from that window. */
export async function apiEmitNotchAction(payload: NotchActionPayload): Promise<void> {
  await emit(NOTCH_ACTION_EVENT, payload)
}

/** Reports that the card closed itself. Called from the notch window. */
export async function apiEmitNotchDismissed(payload: NotchDismissedPayload): Promise<void> {
  await emit(NOTCH_DISMISSED_EVENT, payload)
}

/** Pushes a new model into the open notch window. Called from the main window. */
export async function apiEmitNotchUpdate(payload: NotchUpdatePayload): Promise<void> {
  await emit(NOTCH_UPDATE_EVENT, payload)
}

export async function apiOnNotchAction(
  handler: (payload: NotchActionPayload) => void
): Promise<UnlistenFn> {
  return listen<NotchActionPayload>(NOTCH_ACTION_EVENT, (event) => handler(event.payload))
}

export async function apiOnNotchDismissed(
  handler: (payload: NotchDismissedPayload) => void
): Promise<UnlistenFn> {
  return listen<NotchDismissedPayload>(NOTCH_DISMISSED_EVENT, (event) => handler(event.payload))
}

export async function apiOnNotchUpdate(
  handler: (payload: NotchUpdatePayload) => void
): Promise<UnlistenFn> {
  return listen<NotchUpdatePayload>(NOTCH_UPDATE_EVENT, (event) => handler(event.payload))
}

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

/**
 * Reveals the notch window without stealing focus.
 *
 * A notification is not a request for attention the user made, so it must never interrupt what they
 * are doing: `WebviewWindow.show()` makes the window key on macOS and brings the whole application
 * forward, which pulled the keyboard out of the editor the user was typing in. The backend orders
 * the window front without activating instead.
 *
 * A failure is swallowed, and there is deliberately **no** `show()` fallback any more. It used to
 * be one, reasoning that a card that appears rudely beats one that never appears; that trade is
 * wrong. A card is a courtesy, and one that takes the keyboard mid-keystroke costs the user far
 * more than the card was ever worth — so the failure mode is silence and a line in the console.
 * The backend half of `show_without_activating` dropped the same fallback for the same reason.
 */
export async function apiShowWithoutActivating(): Promise<void> {
  try {
    await showWithoutActivating()
  } catch (e) {
    console.warn('Failed to show the notch window without activating:', e)
  }
}

/**
 * Makes the notch window one the user can click without it costing them what they were doing.
 *
 * The other half of {@link apiShowWithoutActivating}, and the one that was missing: showing the
 * card without activating the app is worth nothing if *clicking* it activates the app anyway — and
 * on macOS, clicking any window of a background application does exactly that, before the click
 * reaches whatever is inside it. So the ✕ pulled the app forward, and the Cancel button did nothing
 * at all (the click that activates an app is not delivered to the view under it). The backend turns
 * the window into a nonactivating panel and makes its webview accept that first click.
 *
 * Called on every card rather than once at creation, because the notch keeps one window for the
 * life of the app — see `notchWindow.ts`'s header, and `make_window_nonactivating`'s own.
 *
 * A failure is swallowed and logged: a card that is rude is still better than no card at all, which
 * is the opposite of the trade {@link apiShowWithoutActivating} makes — nothing here can take the
 * user's keyboard mid-keystroke, it can only fail to give them back a click.
 */
export async function apiMakeWindowNonactivating(): Promise<void> {
  try {
    if (await makeWindowNonactivating()) return
    console.warn(
      'The notch window could not be made nonactivating; clicking the card will bring the app ' +
        'forward and its buttons may not respond.'
    )
  } catch (e) {
    console.warn('Failed to make the notch window nonactivating:', e)
  }
}

/**
 * Whether the *application* was frontmost — the question the notch opener has to answer before it
 * creates a window, since creating one activates the app (see {@link apiResignAppActivation}).
 *
 * A failure answers `true`: the caller reads that as "it was already active, leave it alone", which
 * is the one answer that can never deactivate the app behind the user's back.
 */
export async function apiIsAppActive(): Promise<boolean> {
  try {
    return await isAppActive()
  } catch (e) {
    console.warn('Failed to read whether the app is active:', e)
    return true
  }
}

/**
 * Points a window that already exists at a new URL.
 *
 * How the notch shows every card after the first: navigating touches no `NSApplication`, where
 * *creating* a webview activates the whole app whatever the window options say. Rejects rather than
 * swallowing — the caller's fallback is to open a window the old way, and it can only choose that
 * if it is told.
 */
export async function apiNavigateWindow(label: string, url: string): Promise<void> {
  await navigateWindow(label, url)
}

/**
 * The real per-machine notch/camera-housing geometry, or `null` when there is nothing to go on —
 * a failed call folds into the same answer as the backend's own "no screens" case, since every
 * caller already treats `null` as "fall back to the package's defaults".
 */
export async function apiGetNotchMetrics(): Promise<NotchMetrics | null> {
  try {
    return await getNotchMetrics()
  } catch (e) {
    console.warn('Failed to read the notch geometry:', e)
    return null
  }
}
