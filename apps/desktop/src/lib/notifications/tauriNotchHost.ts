/**
 * The Tauri implementation of `@git-manager/notch`'s host seam: the notch card's surface is a real
 * OS window, moved frame by frame.
 *
 * Moving the *window* rather than transforming its content is what makes the card read as a native
 * banner emerging from behind the menu bar, the way the macOS notification and AirDrop HUDs do.
 * It is also why this can't live in the package: `setPosition` only exists inside a webview.
 */

import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { NotchHost } from '@git-manager/notch'
import {
  apiClearWindowBackdrop,
  apiPlaySystemSound,
  apiRaiseAboveMenuBar,
} from '../../api/notification.api'

/**
 * Independent of the user's chosen native-banner sound (`settings.notifications.soundName`): there
 * is no banner in this path to attach a sound to, so this is a fixed, standalone system sound
 * rather than a repurposed notification setting.
 */
export const NOTCH_SOUND = 'Pop'

export interface TauriNotchHostOptions {
  /** The window's x, held constant while only its y is animated. */
  windowX: number
  withSound: boolean
}

export function createTauriNotchHost({ windowX, withSound }: TauriNotchHostOptions): NotchHost {
  const host: NotchHost = {
    async prepare() {
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
      return getCurrentWindow().show()
    },
    setY(y) {
      return getCurrentWindow().setPosition(new LogicalPosition(windowX, y))
    },
    close() {
      return getCurrentWindow().close()
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
