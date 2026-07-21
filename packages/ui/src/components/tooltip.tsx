import React, { useState, useCallback, useRef, useEffect, useId } from 'react'
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

function computePosition(
  triggerRect: DOMRect,
  tooltipRect: { width: number; height: number },
  preferred: Placement
): { top: number; left: number; actual: Placement } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const scrollX = window.scrollX
  const scrollY = window.scrollY

  // Try the preferred placement, then flip if it doesn't fit
  const placements: Placement[] = [
    preferred,
    preferred === 'top'
      ? 'bottom'
      : preferred === 'bottom'
        ? 'top'
        : preferred === 'left'
          ? 'right'
          : 'left',
    'top',
    'bottom',
    'left',
    'right',
  ]

  for (const p of placements) {
    let top = 0
    let left = 0

    switch (p) {
      case 'top':
        top = triggerRect.top + scrollY - tooltipRect.height - GAP
        left = triggerRect.left + scrollX + triggerRect.width / 2 - tooltipRect.width / 2
        break
      case 'bottom':
        top = triggerRect.bottom + scrollY + GAP
        left = triggerRect.left + scrollX + triggerRect.width / 2 - tooltipRect.width / 2
        break
      case 'left':
        top = triggerRect.top + scrollY + triggerRect.height / 2 - tooltipRect.height / 2
        left = triggerRect.left + scrollX - tooltipRect.width - GAP
        break
      case 'right':
        top = triggerRect.top + scrollY + triggerRect.height / 2 - tooltipRect.height / 2
        left = triggerRect.right + scrollX + GAP
        break
    }

    // Clamp to viewport
    const clampedLeft = Math.max(4, Math.min(left, vw + scrollX - tooltipRect.width - 4))
    const clampedTop = Math.max(4, Math.min(top, vh + scrollY - tooltipRect.height - 4))

    // Check if this placement fits without clamping (i.e. the unclamped position is in-bounds)
    const fits =
      left >= 4 &&
      left + tooltipRect.width <= vw + scrollX - 4 &&
      top >= 4 &&
      top + tooltipRect.height <= vh + scrollY - 4

    if (fits || p === placements[placements.length - 1]) {
      return { top: clampedTop, left: clampedLeft, actual: p }
    }
  }

  // fallback (should never reach)
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

  useEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    setPos(computePosition(triggerRect, { width: rect.width, height: rect.height }, placement))
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
        animate ? 'animate-in fade-in-0 zoom-in-95 duration-150' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        pos
          ? { top: pos.top, left: pos.left, position: 'fixed' }
          : { visibility: 'hidden', position: 'fixed', top: -9999, left: -9999 }
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

// ─── Imperative tooltip helper for non-React elements ─────────────────────────
// Use this when you need to attach a tooltip to a raw DOM element (e.g. heatmap cells)

interface ImperativeTooltipState {
  content: React.ReactNode
  rect: DOMRect
}

export function useImperativeTooltip() {
  const [state, setState] = useState<ImperativeTooltipState | null>(null)

  const show = useCallback((content: React.ReactNode, element: HTMLElement) => {
    setState({ content, rect: element.getBoundingClientRect() })
  }, [])

  const hide = useCallback(() => setState(null), [])

  const portal = state
    ? createPortal(
        <div
          role="tooltip"
          className="pointer-events-none fixed z-tooltip whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[11px] leading-snug text-foreground shadow-xl"
          style={{
            position: 'fixed',
            top: state.rect.top - 32,
            left: state.rect.left + state.rect.width / 2,
            transform: 'translateX(-50%)',
          }}
        >
          {state.content}
        </div>,
        document.body
      )
    : null

  return { show, hide, portal }
}
