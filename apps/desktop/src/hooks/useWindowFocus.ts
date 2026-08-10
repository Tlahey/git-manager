import { useEffect, useState } from 'react'

/** Whether the app window is currently focused AND visible. */
function readFocus(): boolean {
  if (typeof document === 'undefined') return false
  if (document.visibilityState === 'hidden') return false
  // `hasFocus` is missing in some non-browser environments — assume focused there rather than
  // permanently disabling every caller that gates work on it.
  return typeof document.hasFocus === 'function' ? document.hasFocus() : true
}

/**
 * Live "does the app window have focus?" flag, for work that must only run while the user is
 * actually looking at the app.
 *
 * Read from the DOM rather than from Tauri's `onFocusChanged`: the webview's own `focus`/`blur`
 * events already mirror the native window's focus state, they need no async setup (so there's no
 * window where the flag is stale right after mount), and they work unchanged in tests. The
 * `visibilitychange` listener covers minimizing / hiding the app, which doesn't always blur.
 *
 * It reports focus the instant it arrives, and there is deliberately no "settle" delay any more.
 * One existed, for the notch: its cards were gated on the app being unfocused, and creating a
 * webview activates the whole application on macOS — so raising a card switched off the very gate
 * that had raised it. Both halves of that are gone. The notch keeps one window it only navigates
 * (see `lib/notifications/notchWindow.ts`), and its cards are no longer gated on focus at all, so
 * nothing is left that a momentary activation could damage. Don't reintroduce the option without
 * the caller that needs it.
 */
export function useWindowFocus(): boolean {
  const [focused, setFocused] = useState(readFocus)

  useEffect(() => {
    const sync = () => setFocused(readFocus())
    const onFocus = () => setFocused(true)
    const onBlur = () => setFocused(false)

    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', sync)
    // The state initialised at mount can already be stale (the window may have lost focus between
    // render and effect), so re-read once here.
    sync()

    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])

  return focused
}
