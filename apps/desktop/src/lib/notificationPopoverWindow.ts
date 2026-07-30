/**
 * Opener for the custom notification popover window, anchored just under the tray icon in the
 * macOS menu bar (POC — see docs/architecture, "custom notifications" plan).
 *
 * Same shape as `actionJournalWindow.ts`, but the window is transient rather than reused: a fixed
 * label so a second notification replaces the one currently showing instead of stacking (no queue
 * in this POC), and the content is baked into the URL at creation time (rather than pushed via an
 * event after the fact) so there's no race between the window mounting and its content arriving.
 */

import { apiGetTrayIconRect } from '../api/notification.api'
import type { AppNotification } from '../stores/notification.store'

const WINDOW_LABEL = 'notification-popover'
const POPOVER_WIDTH = 440
/** The four stacked rows of `NotificationPopoverWindow` add up to exactly this: the notch band
 * (32) + header (48) + PR (48) + actions (48), plus the 1px rule under the header and above the
 * actions. Change a row's padding there and this has to follow, or the flexible PR row silently
 * absorbs the difference. */
const POPOVER_HEIGHT = 178
/**
 * Transparent margin around the visible card, on all four sides, inside the OS window. Needed so
 * the halo glow (a `box-shadow` on the card) has room to bleed outward — a `box-shadow` is clipped
 * at its own window's edge, so a card that filled the entire window couldn't show any glow at all.
 * Sized a little above the halo's widest blur radius (20px at the pulse's peak) so the glow fades
 * out on its own rather than being cut off at the window edge. Exported so
 * `NotificationPopoverWindow` can inset the card by the same amount and keep the window's position
 * and the card's visual position (`restX`/`restY`) in sync.
 */
export const HALO_MARGIN = 26

/** Payload baked into the popover window's URL — its own resting x/y travel with it, rather than
 * being re-derived inside that window (fewer IPC round-trips, one less thing that can fail
 * silently and leave the window stuck invisible). */
export interface NotificationPopoverPayload {
  notif: AppNotification
  restX: number
  restY: number
}

/**
 * Opens the popover horizontally centered on the primary display, its top edge flush with the
 * very top of the screen (the tray icon rect's own top, `rect.y`) — as high as it can go, so it
 * sits over the menu bar rather than under it. Visible there thanks to `raise_above_menu_bar`,
 * which the popover calls on mount to sit above the bar's native z-order; without that call this
 * would just render underneath the bar. Returns `false` — the caller's cue to fall back to a native banner —
 * when the tray icon's rect isn't available, or when window creation itself fails or is still
 * unresolved after a short timeout (rather than reporting success just because the constructor
 * call didn't throw synchronously, which it never does: creation happens asynchronously and only
 * reports failure via a `tauri://error` event on the returned instance).
 *
 * Created invisible: `NotificationPopoverWindow` positions it one slide-step above this resting
 * spot and animates it down before calling `show()`, so nothing flashes at the wrong spot first.
 */
export async function openNotificationPopoverWindow(notif: AppNotification): Promise<boolean> {
  const rect = await apiGetTrayIconRect()
  if (!rect) return false

  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
  const { primaryMonitor } = await import('@tauri-apps/api/window')

  const existing = await WebviewWindow.getByLabel(WINDOW_LABEL)
  if (existing) await existing.close()

  const monitor = await primaryMonitor()
  // A sane fallback screen width when no monitor info comes back, rather than guessing from the
  // tray rect (which sits near the right edge, not the screen's midpoint).
  const screenWidth = monitor ? monitor.size.toLogical(monitor.scaleFactor).width : 1440
  const restX = screenWidth / 2 - POPOVER_WIDTH / 2
  // Flush with the tray icon's own top edge (minus a hair more) — as high as the window can go
  // without drifting off the top of the screen. The card is taller than the menu bar itself, so
  // most of it still hangs below the bar; only `raise_above_menu_bar` is what lets this top sliver
  // draw over the bar instead of being cropped by it.
  const restY = rect.y - 1

  const payloadValue: NotificationPopoverPayload = { notif, restX, restY }
  const payload = encodeURIComponent(JSON.stringify(payloadValue))

  const win = new WebviewWindow(WINDOW_LABEL, {
    url: `/?window=notification-popover&payload=${payload}`,
    // The OS window is bigger than the visible card by `HALO_MARGIN` on every side; the card is
    // inset by that same margin inside it (see `NotificationPopoverWindow`), which is what keeps
    // its visible position at exactly (restX, restY) as if the window were card-sized.
    width: POPOVER_WIDTH + HALO_MARGIN * 2,
    height: POPOVER_HEIGHT + HALO_MARGIN * 2,
    x: restX - HALO_MARGIN,
    y: restY - HALO_MARGIN,
    decorations: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    // No native window shadow. macOS draws it around the *window's* rectangle, not around the
    // card painted inside it — so on a window deliberately larger than its content (the halo
    // margin) it renders as a grey blurred rectangle floating in the transparent margin, with a
    // hard edge where the window ends. The card's glow is the halo, and only the halo.
    shadow: false,
    focus: false,
    visible: false,
  })

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
      console.warn('Notification popover window failed to create:', e)
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
