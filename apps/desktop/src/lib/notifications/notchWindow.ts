/**
 * Opener for the notch window — the app's own notification card, anchored at the very top of the
 * primary display where a MacBook's camera housing is.
 *
 * Same shape as `actionJournalWindow.ts`, but the window is transient rather than reused: a fixed
 * label so a second card replaces the one currently showing, and the content is baked into the URL
 * at creation time (rather than pushed via an event after the fact) so there is no race between
 * the window mounting and its content arriving.
 *
 * Everything about the card's *appearance* — its rows, its height, where the halo margin goes —
 * lives in `@git-manager/notch`. What stays here is the part that is genuinely Tauri: asking the
 * OS where the tray icon is, how wide the display is, and creating the window.
 */

import { computeNotchPlacement, measureCardHeight } from '@git-manager/notch'
import { apiGetTrayIconRect } from '../../api/notification.api'
import { resolveNotchMetrics } from './notchMetrics'
import type { NotchRequest } from './notchDelivery'

const WINDOW_LABEL = 'notch'

/**
 * What travels to the notch window in its URL.
 *
 * Deliberately a `NotchModel` rather than an `AppNotification`: the window renders cards, not pull
 * requests, so a git hook or a finished task can open it with no notification anywhere in sight.
 *
 * `importance` and `nativeFallback` are dropped on the way in — both are *delivery* decisions,
 * already made by the time this runs, and the window has no business re-litigating them (nor
 * carrying them through a URL).
 */
export interface NotchPayload extends Omit<NotchRequest, 'importance' | 'nativeFallback'> {
  /** The OS window's own top-left, halo margin included — what the window animates itself to. */
  windowX: number
  windowY: number
  /**
   * The real per-machine notch geometry (`get_notch_metrics`), carried through the URL rather
   * than re-read by the notch window itself — it is one native call per card either way, and this
   * is the one place that already makes it, alongside the tray rect and the monitor size.
   * Undefined falls back to the package's own defaults (see `NotchCardProps`).
   */
  bandHeight?: number
  housingHalfWidth?: number
}

/**
 * Opens the card horizontally centred on the primary display, its top edge flush with the very top
 * of the screen (the tray icon rect's own top) — as high as it can go, so it sits over the menu bar
 * rather than under it. Visible there thanks to `raise_above_menu_bar`, which the window calls on
 * mount to sit above the bar's native z-order; without that call this would just render underneath.
 *
 * Returns `false` — the caller's cue to fall back to a native banner — when the tray icon's rect
 * isn't available, or when window creation itself fails or is still unresolved after a short
 * timeout (rather than reporting success just because the constructor call didn't throw
 * synchronously, which it never does: creation happens asynchronously and only reports failure via
 * a `tauri://error` event on the returned instance).
 *
 * Created invisible: the window positions itself one slide-step above its resting spot and animates
 * down before calling `show()`, so nothing flashes at the wrong place first.
 */
export interface OpenNotchWindowOptions {
  /**
   * Called once the window is gone, however it went.
   *
   * The card announces its own dismissal, and that is the path the queue normally advances on. This
   * is the backstop for the times it doesn't — a crash, a webview torn down mid-emit, a window the
   * OS closed on us. Without it a single lost announcement wedges the queue permanently: the app
   * goes on believing a card is up, and every notification after it waits behind a window that no
   * longer exists. Firing twice is harmless (the caller matches on the card's id); never firing is
   * not.
   */
  onDestroyed?: () => void
}

export async function openNotchWindow(
  request: NotchRequest,
  options: OpenNotchWindowOptions = {}
): Promise<boolean> {
  const rect = await apiGetTrayIconRect()
  if (!rect) return false

  const { importance: _importance, nativeFallback: _nativeFallback, ...payload } = request

  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
  const { primaryMonitor } = await import('@tauri-apps/api/window')

  const existing = await WebviewWindow.getByLabel(WINDOW_LABEL)
  if (existing) await existing.close()

  const [monitor, metrics] = await Promise.all([primaryMonitor(), resolveNotchMetrics()])
  // A sane fallback screen width when no monitor info comes back, rather than guessing from the
  // tray rect (which sits near the right edge, not the screen's midpoint).
  const screenWidth = monitor ? monitor.size.toLogical(monitor.scaleFactor).width : 1440

  const { window: rectangle } = computeNotchPlacement({
    screenWidth,
    cardHeight: measureCardHeight(payload.model, metrics?.safeAreaTop),
    // Flush with the tray icon's own top edge (minus a hair) — as high as the window can go
    // without drifting off the top of the screen. The card is taller than the menu bar itself, so
    // most of it still hangs below the bar; only `raise_above_menu_bar` is what lets this top
    // sliver draw over the bar instead of being cropped by it.
    topY: rect.y - 1,
  })

  const full: NotchPayload = {
    ...payload,
    windowX: rectangle.x,
    windowY: rectangle.y,
    ...(metrics?.safeAreaTop !== undefined ? { bandHeight: metrics.safeAreaTop } : {}),
    ...(metrics?.housingHalfWidth !== undefined
      ? { housingHalfWidth: metrics.housingHalfWidth }
      : {}),
  }
  const encoded = encodeURIComponent(JSON.stringify(full))

  const win = new WebviewWindow(WINDOW_LABEL, {
    url: `/?window=notch&payload=${encoded}`,
    // The OS window is bigger than the visible card by one halo margin on every side; the card is
    // inset by that same margin inside it, which is what keeps its visible position exactly where
    // `computeNotchPlacement` put it, as if the window were card-sized.
    width: rectangle.width,
    height: rectangle.height,
    x: rectangle.x,
    y: rectangle.y,
    decorations: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    // No native window shadow. macOS draws it around the *window's* rectangle, not around the card
    // painted inside it — so on a window deliberately larger than its content (the halo margin) it
    // renders as a grey blurred rectangle floating in the transparent margin, with a hard edge
    // where the window ends. The card's glow is the halo, and only the halo.
    shadow: false,
    focus: false,
    visible: false,
  })

  if (options.onDestroyed) win.once('tauri://destroyed', options.onDestroyed)

  return new Promise((resolve) => {
    let settled = false
    win.once('tauri://created', () => {
      if (settled) return
      settled = true
      resolve(true)
    })
    win.once('tauri://error', (e) => {
      if (settled) return
      settled = true
      console.warn('Notch window failed to create:', e)
      resolve(false)
    })
    // Neither event is guaranteed to arrive promptly on every platform — don't block the caller
    // (and the fallback decision) on it forever.
    setTimeout(() => {
      if (settled) return
      settled = true
      resolve(true)
    }, 1000)
  })
}

/**
 * Closes the notch window if one is open, without waiting for its exit animation.
 *
 * The blunt path: the queue was cleared, or the app is shutting the surface down. A card the
 * *user* dismissed closes itself instead, so it gets to slide back up first.
 */
export async function closeNotchWindow(): Promise<void> {
  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
    const existing = await WebviewWindow.getByLabel(WINDOW_LABEL)
    await existing?.close()
  } catch (e) {
    console.warn('Failed to close the notch window:', e)
  }
}
