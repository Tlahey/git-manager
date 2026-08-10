import { useEffect, useState } from 'react'

/** Whether the app window is currently focused AND visible. */
function readFocus(): boolean {
  if (typeof document === 'undefined') return false
  if (document.visibilityState === 'hidden') return false
  // `hasFocus` is missing in some non-browser environments — assume focused there rather than
  // permanently disabling every caller that gates work on it.
  return typeof document.hasFocus === 'function' ? document.hasFocus() : true
}

export interface UseWindowFocusOptions {
  /**
   * How long focus must *hold* before it is reported as regained. Losing it is always reported at
   * once — this only distrusts the other direction.
   *
   * Defaults to `0`, which is the plain flag. Pass a few hundred milliseconds when a momentary
   * activation would do real damage: the notch gates its cards on this being false
   * (`useNotchOperation`'s `enabled`), and the app can activate *itself* as a side effect of
   * raising a card — opening a webview does it on macOS, whatever the window options say. Reacting
   * to that instantly switched the card off, took its window down, and put it back on the next
   * tick, so a search that should have shown one card showed a flicker of nothing at all.
   */
  settleMs?: number
}

/**
 * Live "does the app window have focus?" flag, for background work that must only run while the
 * user is actually looking at the app (auto-fetch, see `useAutoFetch`).
 *
 * Read from the DOM rather than from Tauri's `onFocusChanged`: the webview's own `focus`/`blur`
 * events already mirror the native window's focus state, they need no async setup (so there's no
 * window where the flag is stale right after mount), and they work unchanged in tests. The
 * `visibilitychange` listener covers minimizing / hiding the app, which doesn't always blur.
 */
export function useWindowFocus({ settleMs = 0 }: UseWindowFocusOptions = {}): boolean {
  const [focused, setFocused] = useState(readFocus)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const clear = () => {
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
    }
    /** Focus is only believed once it has held; losing it is believed immediately. */
    const apply = (next: boolean) => {
      clear()
      if (!next || settleMs <= 0) {
        setFocused(next)
        return
      }
      timer = setTimeout(() => setFocused(true), settleMs)
    }

    const sync = () => apply(readFocus())
    const onFocus = () => apply(true)
    const onBlur = () => apply(false)

    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', sync)
    // The state initialised at mount can already be stale (the window may have lost focus between
    // render and effect), so re-read once here.
    sync()

    return () => {
      clear()
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [settleMs])

  return focused
}
