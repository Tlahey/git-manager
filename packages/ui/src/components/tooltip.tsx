import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useId } from 'react'
import { createPortal } from 'react-dom'

// Accessible, portal-rendered tooltip. Unlike a bare `title=` attribute it renders
// real formatted content, auto-flips away from viewport edges, appears on both hover
// and keyboard focus, wires the trigger to the bubble via `aria-describedby`, and
// dismisses on Escape. For raw (non-React) DOM elements — e.g. heatmap cells — use
// `useImperativeTooltip` instead.

// ─── Types ────────────────────────────────────────────────────────────────────

type Placement = 'top' | 'bottom' | 'left' | 'right'

export interface TooltipProps {
  /** The content to display inside the tooltip */
  content: React.ReactNode
  /** The trigger element(s) — wrap a single child */
  children: React.ReactElement
  /** Preferred placement (auto-flips if not enough room) */
  placement?: Placement
  /** Delay before showing in ms */
  delay?: number
  /** Additional class names for the tooltip bubble */
  className?: string
  /** Disable the tooltip entirely */
  disabled?: boolean
  /** Play the fade/zoom entry animation when appearing (default: true). */
  animate?: boolean
}

// ─── Positioning logic ───────────────────────────────────────────────────────

const GAP = 6 // px between trigger and tooltip

const EDGE = 4 // px kept clear of the viewport edges

/**
 * Where to put the bubble, given the trigger's viewport rect and the bubble's own size.
 *
 * Coordinates are viewport-relative, matching the `position: fixed` the bubble is rendered with —
 * no scroll offset is added, since a fixed element does not move with the document.
 *
 * A placement is only rejected on the axis it is actually responsible for: `top`/`bottom` own the
 * vertical direction, `left`/`right` the horizontal one. Overflow on the *other* axis is what the
 * clamp exists for, and letting it veto a placement is what used to send a wide bubble on a narrow
 * trigger — the sidebar's is the usual case — skidding off to a completely different side of the
 * trigger than the one that was asked for.
 */
function computePosition(
  triggerRect: DOMRect,
  tooltipRect: { width: number; height: number },
  preferred: Placement
): { top: number; left: number; actual: Placement } {
  const vw = window.innerWidth
  const vh = window.innerHeight

  const opposite: Record<Placement, Placement> = {
    top: 'bottom',
    bottom: 'top',
    left: 'right',
    right: 'left',
  }
  // Preferred first, then its opposite (the flip), then the rest as a last resort.
  const placements: Placement[] = [preferred, opposite[preferred], 'bottom', 'top', 'right', 'left']

  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]
    let top = 0
    let left = 0

    switch (p) {
      case 'top':
        top = triggerRect.top - tooltipRect.height - GAP
        left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2
        break
      case 'bottom':
        top = triggerRect.bottom + GAP
        left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2
        break
      case 'left':
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2
        left = triggerRect.left - tooltipRect.width - GAP
        break
      case 'right':
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2
        left = triggerRect.right + GAP
        break
    }

    // Only the axis this placement controls decides whether it fits; the other one gets clamped.
    const fits =
      p === 'top' || p === 'bottom'
        ? top >= EDGE && top + tooltipRect.height <= vh - EDGE
        : left >= EDGE && left + tooltipRect.width <= vw - EDGE

    if (fits || i === placements.length - 1) {
      return {
        top: Math.max(EDGE, Math.min(top, vh - tooltipRect.height - EDGE)),
        left: Math.max(EDGE, Math.min(left, vw - tooltipRect.width - EDGE)),
        actual: p,
      }
    }
  }

  // Unreachable: the loop always returns on its last iteration.
  return { top: 0, left: 0, actual: preferred }
}

// ─── Tooltip Bubble (portal-rendered) ─────────────────────────────────────────

function TooltipBubble({
  id,
  content,
  triggerRect,
  placement,
  className,
  animate,
}: {
  id: string
  content: React.ReactNode
  triggerRect: DOMRect
  placement: Placement
  className?: string
  animate: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; actual: Placement } | null>(null)

  // `useLayoutEffect`, not `useEffect`: measuring and placing has to happen *before* the browser
  // paints. With `useEffect` the bubble was painted once at its previous coordinates and only then
  // corrected, which reads as the tooltip appearing up-and-left of the trigger and snapping onto it
  // a frame later — the effect is most visible on small triggers like a toolbar icon.
  //
  // `offsetWidth`/`offsetHeight`, not `getBoundingClientRect()`: the entry animation is already
  // running at this point, and a bounding rect reports the element's *transformed* box — so the
  // bubble would measure ~4% small, get placed from those wrong dimensions, and then drift as the
  // scale settles to 1. The offset sizes are the untransformed layout box.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setPos(
      computePosition(triggerRect, { width: el.offsetWidth, height: el.offsetHeight }, placement)
    )
  }, [triggerRect, placement])

  return createPortal(
    <div
      ref={ref}
      id={id}
      role="tooltip"
      className={[
        'fixed z-tooltip rounded-lg px-2.5 py-1.5',
        'border border-border bg-popover shadow-xl',
        'text-[11px] leading-snug text-foreground',
        'pointer-events-none whitespace-nowrap',
        animate ? 'animate-in fade-in-0 zoom-in-95' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      // `transition: none` is load-bearing, not cosmetic. The bubble is mounted off-screen to be
      // measured and only then moved onto the trigger, so *any* transition reaching `top`/`left`
      // animates that move: the tooltip appears far above where it belongs and slides down into
      // place. That is what a stray `duration-150` here used to do — `duration-*` sets
      // `transition-duration`, leaving `transition-property` at its CSS initial value, `all`. The
      // entry animation above is a keyframe animation, which `transition: none` does not touch;
      // time it with `animate-duration-*`, never `duration-*`. Pinning it inline also immunises
      // the bubble against a caller passing a transition class through `className`.
      style={
        pos
          ? { top: pos.top, left: pos.left, position: 'fixed', transition: 'none' }
          : {
              visibility: 'hidden',
              position: 'fixed',
              top: -9999,
              left: -9999,
              transition: 'none',
            }
      }
    >
      {content}
    </div>,
    document.body
  )
}

// ─── Tooltip Component ────────────────────────────────────────────────────────

export function Tooltip({
  content,
  children,
  placement = 'top',
  delay = 150,
  className,
  disabled = false,
  animate = true,
}: TooltipProps) {
  const [show, setShow] = useState(false)
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const tooltipId = useId()

  const handleEnter = useCallback(() => {
    if (disabled) return
    timerRef.current = setTimeout(() => {
      if (triggerRef.current) {
        setTriggerRect(triggerRef.current.getBoundingClientRect())
        setShow(true)
      }
    }, delay)
  }, [delay, disabled])

  const handleLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setShow(false)
  }, [])

  // Becoming disabled retracts an already-visible bubble, it doesn't merely block the next one.
  // Callers disable a tooltip precisely when it has stopped being the relevant thing to show (the
  // pointer moved onto a child with its own tooltip, the trigger's action became unavailable…), and
  // leaving a stale bubble on screen until the pointer happens to exit is the wrong reading of it.
  useEffect(() => {
    if (!disabled) return
    if (timerRef.current) clearTimeout(timerRef.current)
    setShow(false)
  }, [disabled])

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // Clone the child and attach mouse handlers + ref
  const child = React.Children.only(children)
  const cloned = React.cloneElement(child, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node
      // Forward ref if the child already has one
      const { ref } = child as { ref?: React.Ref<HTMLElement> }
      if (typeof ref === 'function') ref(node)
      else if (ref && typeof ref === 'object')
        (ref as React.MutableRefObject<HTMLElement | null>).current = node
    },
    // Point assistive tech at the bubble only while it is visible.
    'aria-describedby': show ? tooltipId : child.props['aria-describedby'],
    onMouseEnter: (e: React.MouseEvent) => {
      handleEnter()
      child.props.onMouseEnter?.(e)
    },
    onMouseLeave: (e: React.MouseEvent) => {
      handleLeave()
      child.props.onMouseLeave?.(e)
    },
    onFocus: (e: React.FocusEvent) => {
      handleEnter()
      child.props.onFocus?.(e)
    },
    onBlur: (e: React.FocusEvent) => {
      handleLeave()
      child.props.onBlur?.(e)
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      // Escape dismisses the tooltip without moving focus (WAI-ARIA tooltip pattern).
      if (e.key === 'Escape') handleLeave()
      child.props.onKeyDown?.(e)
    },
  } as React.HTMLAttributes<HTMLElement>)

  return (
    <>
      {cloned}
      {show && triggerRect && (
        <TooltipBubble
          id={tooltipId}
          content={content}
          triggerRect={triggerRect}
          placement={placement}
          className={className}
          animate={animate}
        />
      )}
    </>
  )
}
