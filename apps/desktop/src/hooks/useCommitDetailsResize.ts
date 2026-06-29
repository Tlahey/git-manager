import React, { useCallback, useState, useRef } from 'react'

export function useCommitDetailsResize(defaultWidth = 400, minWidth = 350, maxWidth = 700) {
  const [width, setWidth] = useState(defaultWidth)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(defaultWidth)

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = true
    startX.current = e.clientX
    startWidth.current = width
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }, [width])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return
    const delta = startX.current - e.clientX
    const next = Math.max(minWidth, Math.min(maxWidth, startWidth.current + delta))
    setWidth(next)
  }, [minWidth, maxWidth])

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
    width,
    resizeProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
    }
  }
}
