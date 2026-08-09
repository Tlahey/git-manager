import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface HoverExpandLabelProps {
  /** The text shown (truncated normally, full on hover when it overflows). */
  children: React.ReactNode
  /** Classes applied to the text (BOTH the truncated one and the overlay) so they stay in sync. */
  className?: string
  /** Extra class on the container. */
  containerClassName?: string
}

/**
 * Shows truncated text that reveals its full contents on hover, **only when it actually
 * overflows** (measured as `scrollWidth > clientWidth`).
 *
 * The full overlay is rendered `position: fixed` through a portal on `body`, positioned from the
 * truncated text's `getBoundingClientRect`: that way it escapes any `overflow: hidden` on the
 * sidebar / ScrollArea, and can neither be clipped nor "lose" its displayed state.
 */
export function HoverExpandLabel({
  children,
  className = '',
  containerClassName = '',
}: HoverExpandLabelProps) {
  const textRef = useRef<HTMLSpanElement>(null)
  const [overlay, setOverlay] = useState<{
    top: number
    left: number
    height: number
    /** Computed font of the row's text (the portal doesn't inherit the CSS). */
    fontSize: string
    fontFamily: string
    fontWeight: string
    fontStyle: string
    letterSpacing: string
    lineHeight: string
  } | null>(null)

  // Snapshot (position + font) of the truncated text, so the overlay — rendered in a portal on
  // body — gets a pixel-identical font to the row. The properties are read one by one because the
  // `font` shorthand often returns "" under WebKit. The height/vertical position follow the whole
  // row (the virtualizer's [data-index] wrapper) to match the selected element's height.
  const measure = () => {
    const el = textRef.current
    if (!el) return null
    const cs = getComputedStyle(el)
    const textRect = el.getBoundingClientRect()
    const rowEl = el.closest('[data-index]') as HTMLElement | null
    const rowRect = (rowEl ?? el).getBoundingClientRect()
    return {
      top: rowRect.top,
      left: textRect.left,
      height: rowRect.height,
      fontSize: cs.fontSize,
      fontFamily: cs.fontFamily,
      fontWeight: cs.fontWeight,
      fontStyle: cs.fontStyle,
      letterSpacing: cs.letterSpacing,
      lineHeight: cs.lineHeight,
    }
  }

  const showOverlay = () => {
    const el = textRef.current
    if (!el) return
    // No overflow → no overlay.
    if (el.scrollWidth <= el.clientWidth + 1) return
    setOverlay(measure())
  }

  const hideOverlay = () => setOverlay(null)

  // Reposition / hide the overlay if the window moves while hovering.
  useLayoutEffect(() => {
    if (!overlay) return
    const update = () => setOverlay(measure())
    window.addEventListener('scroll', hideOverlay, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', hideOverlay, true)
      window.removeEventListener('resize', update)
    }
  }, [overlay])

  return (
    <div
      className={`relative min-w-0 flex-1 ${containerClassName}`}
      onMouseEnter={showOverlay}
      onMouseLeave={hideOverlay}
    >
      <span ref={textRef} className={`block truncate ${className}`}>
        {children}
      </span>

      {overlay &&
        createPortal(
          // Opaque base = the sidebar's own background (bg-sidebar) to hide the content
          // underneath, then the default hover colour (bg-sidebar-accent/60 +
          // text-sidebar-foreground) on top → same row, same design. The font is copied from the
          // text (the portal doesn't inherit the CSS → otherwise it would take the body's, far too
          // large). The height matches the whole row (the selected element).
          <span
            className="pointer-events-none fixed z-overlay flex items-center bg-sidebar whitespace-nowrap text-sidebar-foreground"
            style={{
              top: overlay.top,
              height: overlay.height,
              left: overlay.left,
              fontSize: overlay.fontSize,
              fontFamily: overlay.fontFamily,
              fontWeight: overlay.fontWeight,
              fontStyle: overlay.fontStyle,
              letterSpacing: overlay.letterSpacing,
              lineHeight: overlay.lineHeight,
            }}
          >
            <span className="flex h-full items-center bg-sidebar-accent/60 pr-2 whitespace-nowrap">
              {children}
            </span>
          </span>,
          document.body
        )}
    </div>
  )
}
