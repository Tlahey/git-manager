import React, { useCallback, useState } from 'react'

/**
 * Drag-to-resize a panel's height via a horizontal handle. Spread `resizeProps`
 * on the handle element (rendered with `cursor-row-resize`); dragging down
 * grows the panel above the handle.
 */
export function useVerticalResize(defaultHeight = 200, minHeight = 80, maxHeight = 600) {
  const [height, setHeight] = useState(defaultHeight)
  const isDragging = React.useRef(false)
  const startY = React.useRef(0)
  const startHeight = React.useRef(defaultHeight)

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = true
    startY.current = e.clientY
    startHeight.current = height
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }, [height])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return
    const delta = e.clientY - startY.current
    const next = Math.max(minHeight, Math.min(maxHeight, startHeight.current + delta))
    setHeight(next)
  }, [minHeight, maxHeight])

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return
    isDragging.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }, [])

  return {
    height,
    resizeProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
    },
  }
}
