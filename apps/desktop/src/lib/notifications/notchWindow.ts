/**
 * Opener for the notch window — the app's own notification card, anchored at the very top of the
 * primary display where a MacBook's camera housing is.
 *
 * The content is baked into the window's URL rather than pushed by an event after the fact, so
 * there is never a race between the window mounting and its content arriving. Everything about the
 * card's *appearance* — its rows, its height, where the halo margin goes — lives in
 * `@git-manager/notch`. What stays here is the part that is genuinely Tauri: asking the OS where
 * the tray icon is, how wide the display is, and putting a window there.
 *
 * ## Why there is exactly one window, parked and reused (do not go back to one per card)
 *
 * wry activates the whole application every time it *creates* a webview — unconditionally, gated
 * on nothing (`wkwebview/mod.rs`: "make sure the window is always on top when we create a new
 * webview"; not `focus: false`, not `visible: false`, not the window level). A notch card is by
 * definition raised while the user is somewhere else, so creating a window per card meant every
 * card yanked the whole app in front of whatever they were doing.
 *
 * Handing the activation straight back afterwards (`apiResignAppActivation`) was tried and is not
 * enough on its own: the app still visibly comes forward first, and `NSApplication.deactivate`
 * only bites once the activation has landed, which is a race rather than a guarantee. Worse, the
 * blip was self-amplifying at the time — the cards that most want the notch were then gated on the
 * app being unfocused, so an activation the app caused itself switched the card off, closed the
 * window, and re-opened it on the next tick. That gate is gone (the AI cards now show focused or
 * not), so the amplifier is gone with it; the activation itself is not, and a producer that ever
 * reads focus again would bring the loop straight back.
 *
 * So the window is created **once, while the app is legitimately frontmost** (at startup, via
 * {@link warmUpNotchWindow}) and thereafter *navigated* per card. A navigation touches no
 * `NSApplication`, so no card after the first ever costs the user their keyboard. Everything else
 * about the design is unchanged: same fixed label, same payload-in-the-URL, same fresh mount per
 * card. Creating one on demand survives as the fallback for when there is no parked window to
 * navigate — the app was launched into the background, the window crashed, the e2e suite.
 */

import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi'
import { computeNotchPlacement, measureCardHeight } from '@git-manager/notch'
import { apiGetTrayIconRect, apiIsAppActive, apiNavigateWindow } from '../../api/notification.api'
import { resolveNotchMetrics } from './notchMetrics'
import type { NotchRequest } from './notchDelivery'

const WINDOW_LABEL = 'notch'

/**
 * The parked window's URL: the notch kind, with no card in it.
 *
 * `main.tsx` renders nothing for this and — unlike every other unrenderable secondary window —
 * deliberately does *not* close it. It is not a window that failed to receive its parameters; it is
 * a window waiting for its first card.
 */
const PARKED_URL = '/?window=notch'

/** The card's URL, content and all. */
function cardUrl(payload: NotchPayload): string {
  return `/?window=notch&payload=${encodeURIComponent(JSON.stringify(payload))}`
}

/** Absolute form of an app-relative URL, which is what `navigate_window` needs. */
function absolute(url: string): string {
  return new URL(url, window.location.origin).toString()
}

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

/**
 * Whose {@link OpenNotchWindowOptions.onDestroyed} the window's death should reach.
 *
 * A module-level slot rather than a listener registered per card, and that is not tidiness: the
 * window now outlives every card it shows, so a `once('tauri://destroyed')` per card would pile up
 * one never-firing IPC listener per notification for the life of the app. One listener is
 * registered when the window is created and dispatches to whatever is here.
 */
let currentOnDestroyed: (() => void) | undefined

export async function openNotchWindow(
  request: NotchRequest,
  options: OpenNotchWindowOptions = {}
): Promise<boolean> {
  const rect = await apiGetTrayIconRect()
  if (!rect) return false

  const { importance: _importance, nativeFallback: _nativeFallback, ...payload } = request

  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
  const { primaryMonitor } = await import('@tauri-apps/api/window')

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
  // The parked window, if there is one to reuse. This is the path every card after the app's first
  // second takes, and the whole point of the file: no webview is created, so no `NSApplication` is
  // touched, so the user keeps their keyboard.
  const parked = await WebviewWindow.getByLabel(WINDOW_LABEL)
  if (parked) {
    currentOnDestroyed = options.onDestroyed
    try {
      // Sized and placed before the content arrives: the page measures its slide against the
      // `windowY` in its own payload, so it must find the window already where that says it is.
      await parked.setSize(new LogicalSize(rectangle.width, rectangle.height))
      await parked.setPosition(new LogicalPosition(rectangle.x, rectangle.y))
      await apiNavigateWindow(WINDOW_LABEL, absolute(cardUrl(full)))
      return true
    } catch (e) {
      // Falls through to creating one. Reusing is an optimisation for the user's focus, not a
      // correctness requirement — a card shown rudely still beats no card at all, and unlike the
      // `show()` fallbacks this one only costs focus when the reuse path is already broken.
      console.warn('Notch window could not be reused; opening a new one:', e)
      // And the window in the way has to go first. A label is unique, so `new WebviewWindow` on a
      // label that still exists fails outright — which would make this "fallback" no fallback at
      // all: `openNotchWindow` would report failure, and the queue's own last resort is a macOS
      // banner. That is how a user who chose the notch ends up with a system notification.
      //
      // Cleared first: the death notice of the window being closed here would otherwise reach the
      // handler of the card being opened right now, whose guards would both pass, retiring it the
      // instant it appeared.
      currentOnDestroyed = undefined
      try {
        await parked.close()
      } catch (closeError) {
        console.warn('Notch window could not be closed either:', closeError)
        return false
      }
    }
  }

  const created = await createNotchWindow(cardUrl(full), rectangle)
  if (created) currentOnDestroyed = options.onDestroyed
  return created
}

/**
 * Opens a notch window from scratch — the path that costs focus, and so the one with a veto on it.
 *
 * **Refuses outright unless the application is already frontmost.** Creating a webview activates
 * the whole app on macOS, with nothing to gate it and no reliable way to undo it: handing the
 * activation back afterwards was tried, shipped, and reported from the real app as still visibly
 * stealing the window. So this does not create a window it knows will take the user's keyboard —
 * a card is a courtesy, and the same trade already decided `apiShowWithoutActivating`'s missing
 * fallback. The caller reports failure, and the queue decides what a lost card is worth.
 *
 * Asks the *application*'s flag rather than this webview's focus: another window of ours (merge
 * editor, fixup, action journal) being key is not the app being in the background.
 *
 * The refusal is why {@link warmUpNotchWindow} exists and why it is retried whenever the app comes
 * back to the front: the one window has to be made at a moment this permits, or there is nothing
 * to navigate later.
 */
async function createNotchWindow(
  url: string,
  rectangle: { x: number; y: number; width: number; height: number }
): Promise<boolean> {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')

  if (!(await apiIsAppActive())) {
    console.warn(
      'Notch window not created: the app is in the background and creating one would ' +
        'take the keyboard from whatever the user is doing.'
    )
    return false
  }

  const win = new WebviewWindow(WINDOW_LABEL, {
    url,
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
    // Never takes focus: `focus: false` keeps the window from being made key *at creation*, and
    // `show_without_activating` (rather than `show()`) is how it is revealed — the two halves are
    // separate and neither covers the other. What neither covers at all is the *application*-level
    // activation wry performs at creation, which is why getting here is gated above.
    focus: false,
    // And it can never *become* key either, which is a third, separate thing and the one that made
    // closing a card jump the app in front of the user.
    //
    // tao maps this option onto `canBecomeKeyWindow` **and** `canBecomeMainWindow`
    // (`platform_impl/macos/window.rs`, the `focusable` ivar behind both selectors). Left at its
    // default of `true`, clicking the card's ✕ made this window key — and hiding it is
    // `orderOut:`, which does not drop key status but hands it to the next window of the same
    // application. That is the main window. So dismissing a notification pulled the user out of
    // whatever they were in, at the exact moment they said they were done with it.
    //
    // Nothing on the card wants keyboard focus — it is two buttons and a progress bar, and mouse
    // events reach a window whether or not it is key. Clicking the card *body* still brings the app
    // forward, because that path asks for it explicitly (`NotchWindow.activate`) instead of
    // inheriting it from a window manager's idea of what a click means.
    focusable: false,
    visible: false,
  })

  // One death watch for the window's whole life, dispatching to whichever card is on it — see
  // `currentOnDestroyed`. Registered unconditionally, because the window outlives the call that
  // created it and the card that wants the backstop is usually a later one.
  win.once('tauri://destroyed', () => currentOnDestroyed?.())

  const created = await new Promise<boolean>((resolve) => {
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

  return created
}

/**
 * Creates the parked window at a moment creating one is free.
 *
 * Called from the main window's mount and again whenever the app comes back to the front. Both are
 * moments the app is frontmost anyway, so the activation wry performs on every new webview costs
 * the user nothing — and {@link createNotchWindow} refuses outright at any other moment, which is
 * why this needs the second chance: an app launched into the background (a login item, a window
 * restored behind another app) would otherwise have no window to navigate for the rest of the
 * session, and therefore no cards at all.
 *
 * Idempotent and silent: a window already there is left exactly as it is, and a failure means the
 * next card tries again.
 */
export async function warmUpNotchWindow(): Promise<void> {
  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
    if (await WebviewWindow.getByLabel(WINDOW_LABEL)) return
    // Tiny and off the top of the display. Nothing is ever shown at these bounds — every card
    // sizes and places the window before navigating it — but a window has to be created somewhere,
    // and above the screen is the one place a stray frame could not be seen.
    await createNotchWindow(PARKED_URL, { x: 0, y: -1000, width: 1, height: 1 })
  } catch (e) {
    console.warn('Failed to park a notch window; cards will open their own:', e)
  }
}

/**
 * Takes whatever card is on screen off it, without waiting for its exit animation.
 *
 * The blunt path: the queue was cleared, or the app is shutting the surface down. A card the
 * *user* dismissed leaves the same way but on its own terms, sliding back up first.
 *
 * **Hides and parks rather than closes**, which is the difference between this and what it used to
 * do. A closed window has to be re-created for the next card, and creating one is exactly what
 * drags the whole application forward (see this module's header) — so the window survives every
 * card, and only its *content* comes and goes. Navigating it back to the parked URL is what stops
 * the last card from still being mounted behind the scenes, listening for updates it should no
 * longer answer.
 */
export async function closeNotchWindow(): Promise<void> {
  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
    const existing = await WebviewWindow.getByLabel(WINDOW_LABEL)
    if (!existing) return
    await existing.hide()
    await apiNavigateWindow(WINDOW_LABEL, absolute(PARKED_URL))
  } catch (e) {
    console.warn('Failed to park the notch window:', e)
  }
}
