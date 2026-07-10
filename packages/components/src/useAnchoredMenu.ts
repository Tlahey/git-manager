import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export type MenuAlign = 'left' | 'right'

interface AnchoredMenuOptions {
  /** Horizontal alignment of the menu relative to the trigger. */
  align?: MenuAlign
  /** Vertical offset below the trigger (px). */
  offset?: number
}

/**
 * Drives the open/closed state of a dropdown menu anchored to a trigger button:
 * `position: fixed` placement (rendered via portal by the caller), closes on
 * outside click and Escape.
 */
export function useAnchoredMenu({ align = 'left', offset = 6 }: AnchoredMenuOptions = {}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number }>({ top: 0, left: 0 })

  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const left = align === 'right' ? rect.right : rect.left
    // Flip the menu above the trigger when it sits in the lower part of the window (same
    // heuristic as ContextMenuSurface) so it renders within the window instead of being
    // clipped past the bottom edge — e.g. a footer button's dropdown.
    const openUp = rect.bottom > window.innerHeight * 0.6
    if (openUp) {
      setPos({ bottom: window.innerHeight - rect.top + offset, left })
    } else {
      setPos({ top: rect.bottom + offset, left })
    }
  }, [open, align, offset])

  useEffect(() => {
    if (!open) return

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node
      const inTrigger = containerRef.current?.contains(target)
      const inMenu = menuRef.current?.contains(target)
      if (!inTrigger && !inMenu) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return { open, setOpen, pos, align, containerRef, triggerRef, menuRef }
}
