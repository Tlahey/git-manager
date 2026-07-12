import { useCallback, useEffect, useRef, useState } from 'react'

const WIDTH_STORAGE_KEY = 'sidebar-width'
const COLLAPSED_STORAGE_KEY = 'sidebar-collapsed'
const DEFAULT_WIDTH = 240
const MIN_WIDTH = 160
const MAX_WIDTH = 480

/** Largeur du rail (mode collapsed affichant uniquement les icônes). */
export const RAIL_WIDTH = 48

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

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1'
    } catch {
      return false
    }
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

  const collapse = useCallback(() => setIsCollapsed(true), [])
  const expand = useCallback(() => setIsCollapsed(false), [])
  const toggle = useCallback(() => setIsCollapsed((c) => !c), [])

  // Persistance largeur
  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_STORAGE_KEY, String(width))
    } catch {
      // ignore
    }
  }, [width])

  // Persistance état collapsed
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, isCollapsed ? '1' : '0')
    } catch {
      // ignore
    }
  }, [isCollapsed])

  const resizeHandleProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }

  return {
    width,
    isCollapsed,
    collapse,
    expand,
    toggle,
    resizeHandleProps,
  }
}
