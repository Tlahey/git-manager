// Horizontal scrolling *inside* the commit graph's `graph` column. The column is too narrow to show
// every lane of a busy repo, and widening it is not always an option — so a wheel gesture over the
// column itself pans the lanes sideways (see `graphColumnSizing.ts` for what the offset does to the
// geometry). The offset is owned here rather than by the column state store: it is a transient view
// position, not a user preference, and it must be clamped against a max that changes with the
// column's width and the graph's lane count.
//
// Two deliberate choices in how the gesture is captured:
// - the listener is native and `passive: false`, not React's `onWheel` prop: React attaches wheel
//   handlers passively at the root, which would make `preventDefault()` a no-op and let a
//   Shift+wheel gesture scroll the commit list vertically at the same time;
// - it sits on `window` and hit-tests the container, rather than on the container itself: the list
//   is mounted conditionally (it is replaced by the diff/PR views), so a ref to it is null when the
//   effect first runs — and re-reading the ref at event time also means an unmounted list simply
//   stops capturing anything.

import { useCallback, useEffect, useState, type RefObject } from 'react'

export interface GraphColumnScrollBounds {
  /** x (px, relative to the scroll container's left edge) where the graph column's footprint
   * starts — a wheel outside `[left, left + width]` scrolls the list as usual. */
  left: number
  /** Width (px) of that footprint, margins included. */
  width: number
  /** Largest offset the lanes can be panned by; 0 disables the gesture entirely. */
  maxScrollX: number
}

/**
 * Pans the graph column horizontally on a wheel gesture over it, and returns the current offset
 * plus a setter for programmatic scrolling (e.g. centering a lane on row selection). Both are
 * clamped to `[0, maxScrollX]` so a narrower graph (fewer lanes, wider column) can never leave
 * the view scrolled past the last lane.
 */
export function useGraphColumnScroll(
  containerRef: RefObject<HTMLElement | null>,
  { left, width, maxScrollX }: GraphColumnScrollBounds
): [number, (x: number) => void] {
  const [scrollX, setScrollX] = useState(0)

  useEffect(() => {
    if (maxScrollX <= 0) return
    const onWheel = (e: WheelEvent) => {
      const container = containerRef.current
      if (!container || !(e.target instanceof Node) || !container.contains(e.target)) return
      const x = e.clientX - container.getBoundingClientRect().left
      if (x < left || x > left + width) return
      // Trackpads emit `deltaX` for a two-finger horizontal swipe; a plain wheel has none, so
      // Shift+wheel is the mouse equivalent (and must not also scroll the list vertically).
      const delta = e.deltaX !== 0 ? e.deltaX : e.shiftKey ? e.deltaY : 0
      if (delta === 0) return
      e.preventDefault()
      setScrollX((prev) => Math.min(maxScrollX, Math.max(0, prev + delta)))
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [containerRef, left, width, maxScrollX])

  const scrollTo = useCallback(
    (x: number) => setScrollX(Math.min(maxScrollX, Math.max(0, x))),
    [maxScrollX]
  )

  return [Math.min(scrollX, maxScrollX), scrollTo]
}
