import { useCallback, useEffect, useRef } from 'react'

/**
 * Delay (ms) a single click waits to find out whether it is really the first half of a double one.
 * Short enough not to feel laggy, long enough for an ordinary double click — macOS's own interval
 * is user-configurable up to about a second, but a UI that waits that long to react reads as broken.
 */
export const DOUBLE_CLICK_DELAY = 250

/**
 * Splits a row's click between two actions that must not both run.
 *
 * The DOM fires `click` on the first half of a double click, so a naive pair of handlers runs the
 * single-click action *and* the double-click one. Here the single-click action is held for
 * {@link DOUBLE_CLICK_DELAY}; a second click inside that window cancels it and runs the double-click
 * action alone.
 *
 * Both callbacks are read at fire time, so a handler rebuilt on every render (the usual inline
 * arrow) is safe, and a pending action is dropped when the row unmounts.
 */
export function useSingleOrDoubleClick(
  onSingle: () => void,
  onDouble: () => void,
  delay: number = DOUBLE_CLICK_DELAY
): { handleClick: () => void; handleDoubleClick: () => void } {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const single = useRef(onSingle)
  const double = useRef(onDouble)
  single.current = onSingle
  double.current = onDouble

  const cancel = useCallback(() => {
    if (timer.current === null) return
    clearTimeout(timer.current)
    timer.current = null
  }, [])

  useEffect(() => cancel, [cancel])

  const handleClick = useCallback(() => {
    cancel()
    timer.current = setTimeout(() => {
      timer.current = null
      single.current()
    }, delay)
  }, [cancel, delay])

  const handleDoubleClick = useCallback(() => {
    cancel()
    double.current()
  }, [cancel])

  return { handleClick, handleDoubleClick }
}
