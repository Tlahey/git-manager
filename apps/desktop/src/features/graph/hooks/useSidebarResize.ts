import { useCallback, useEffect, useRef, useState } from 'react'

const WIDTH_STORAGE_KEY = 'sidebar-width'
const DEFAULT_WIDTH = 240
const MIN_WIDTH = 160
const MAX_WIDTH = 480

/**
 * Width of the graph's sidebar, dragged by its right edge and remembered across sessions.
 *
 * It used to own a *collapsed* state as well — the sidebar shrank to a 48px column of section
 * icons. That mode went with the button that was its only entrance: whether the panel is on screen
 * at all is `repoView.store`'s `isPanelOpen` now (⌘S, or the toolbar's own button), one flag for
 * the slot all three views take turns filling. Two neighbouring controls for "give me that width
 * back", each meaning something slightly different, is one more than the question deserves.
 */
export function useSidebarResize() {
  const [width, setWidth] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(WIDTH_STORAGE_KEY)
      if (stored) {
        const parsed = parseInt(stored, 10)
        if (!isNaN(parsed) && parsed >= MIN_WIDTH && parsed <= MAX_WIDTH) return parsed
      }
    } catch {
      // ignore
    }
    return DEFAULT_WIDTH
  })

  const isDragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      isDragging.current = true
      startX.current = e.clientX
      startWidth.current = width
      e.currentTarget.setPointerCapture(e.pointerId)
      e.preventDefault()
    },
    [width]
  )

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return
    const delta = e.clientX - startX.current
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta))
    setWidth(next)
  }, [])

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return
    isDragging.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }, [])

  // Width persistence
  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_STORAGE_KEY, String(width))
    } catch {
      // ignore
    }
  }, [width])

  const resizeHandleProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }

  return {
    width,
    resizeHandleProps,
  }
}
