/**
 * The Tauri implementation of `@git-manager/notch`'s host seam: the notch card's surface.
 *
 * ## Why the window does not move
 *
 * This used to animate the OS window itself, one `setPosition` per frame, so the card would read
 * as a native banner emerging from behind the menu bar. That works only as long as the travel is
 * a short nudge. The moment the card had to slide its own *full height* — which is what makes it
 * appear from nothing and leave to nothing, rather than blinking on and off somewhere already on
 * screen — the window has to spend part of the slide entirely above the top of the display, and
 * macOS will not put it there: `constrainFrameRect:toScreen:` keeps a window within the screen,
 * so the card simply never showed up.
 *
 * So the window now stays exactly where it was created, and the *card inside it* is what moves,
 * as a CSS transform on a wrapper the window's own bounds clip. The card is still revealed by
 * sliding out from under the menu bar — the clip does what moving off-screen was supposed to —
 * and it comes with two things the old way could not have: the animation runs on the compositor
 * instead of one IPC round trip per frame, and nothing about it can be overruled by the window
 * server.
 *
 * The presenter is unchanged and still speaks in absolute Y coordinates; translating those into an
 * offset from the resting position is this seam's job, which is exactly what the seam is for.
 */

import { LogicalSize } from '@tauri-apps/api/dpi'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { NotchHost } from '@git-manager/notch'
import {
  apiClearWindowBackdrop,
  apiMakeWindowNonactivating,
  apiPlaySystemSound,
  apiRaiseAboveMenuBar,
  apiShowWithoutActivating,
} from '../../api/notification.api'

/**
 * Independent of the user's chosen native-banner sound (`settings.notifications.soundName`): there
 * is no banner in this path to attach a sound to, so this is a fixed, standalone system sound
 * rather than a repurposed notification setting.
 */
export const NOTCH_SOUND = 'Pop'

export interface TauriNotchHostOptions {
  /** The card's resting top edge — the Y the presenter slides *to*, and the zero of the offset. */
  restY: number
  /** The element the card is drawn in, moved by transform. Clipped by the window's own bounds. */
  surface: { current: HTMLElement | null }
  withSound: boolean
}

export function createTauriNotchHost({
  restY,
  surface,
  withSound,
}: TauriNotchHostOptions): NotchHost {
  const host: NotchHost = {
    async prepare() {
      // First, and before the raise: turning the window into a panel rewrites its style mask, and
      // the level this window needs is anything but ordinary — asserting it afterwards is what
      // keeps the card over the menu bar whatever `setStyleMask:` does on the way.
      //
      // Here rather than in `notchWindow.ts` for the same reason the two calls below are here:
      // this runs *in* the notch window, once per card, on a window that outlives every card it
      // shows. Without it, clicking the card activates the whole application — and the click never
      // reaches the button the user aimed at. See `apiMakeWindowNonactivating`.
      await apiMakeWindowNonactivating()
      // Above the menu bar's own native z-order, so the card visually emerges from behind it
      // during the slide rather than sliding out from underneath the bar's icons.
      await apiRaiseAboveMenuBar()
      // `transparent: true` on the window is not enough on its own — WKWebView still paints an
      // opaque rectangle under the page, which is what made the card's rounded corners look
      // square. Deliberately NOT `apiSetWindowVibrancy('hud', …)`: that cleared the backdrop too,
      // but only as a side effect of installing an NSVisualEffectView, whose frosted material then
      // filled the whole window — showing up as a pane of glass around the card.
      await apiClearWindowBackdrop()
    },
    show() {
      // Deliberately NOT `getCurrentWindow().show()`. That goes through `makeKeyAndOrderFront:` on
      // macOS, which makes the card key and brings the whole app forward — so a notification
      // arriving while the user was typing somewhere else took their keyboard with it. A card the
      // app raised on its own has to be readable without ever being an interruption; only clicking
      // it may move focus (`NotchWindow.activate`).
      return apiShowWithoutActivating()
    },
    setY(y) {
      // Written straight to the node rather than through React state: this runs once per frame for
      // the length of the slide, and re-rendering the whole card 48 times to move it is work the
      // compositor is already doing for free.
      const node = surface.current
      if (node) node.style.transform = `translateY(${y - restY}px)`
      return Promise.resolve()
    },
    close() {
      // Hidden, not closed. The window outlives every card it shows, because *creating* a webview
      // activates the whole application on macOS and a card is by definition raised while the user
      // is elsewhere — see `notchWindow.ts`'s header. Closing it here would hand that cost to
      // whatever card came next.
      //
      // It also makes the dismissal announcement this runs after actually reliable: it used to
      // travel out of a webview that was being destroyed underneath it, which is the race the
      // queue's `onDestroyed` backstop exists for.
      return getCurrentWindow().hide()
    },
  }

  if (withSound) host.playSound = () => void apiPlaySystemSound(NOTCH_SOUND)
  return host
}

/**
 * Resizes the notch window to fit a card of a different height.
 *
 * Needed because a card can change shape while it is on screen: a progress card that ends as a
 * failure grows an output block, and a window still sized for the old model would simply clip it.
 * Width never changes — the card is a fixed 440 points wide.
 *
 * Failures are swallowed: a card that is slightly the wrong height is far better than one that
 * throws on its way to being right.
 */
export async function resizeNotchWindow(width: number, height: number): Promise<void> {
  try {
    await getCurrentWindow().setSize(new LogicalSize(width, height))
  } catch (e) {
    console.warn('Failed to resize the notch window:', e)
  }
}
