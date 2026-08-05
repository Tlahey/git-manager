import { useState, useCallback, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// ─── Imperative tooltip helper for non-React elements ─────────────────────────
// Use this when you need to attach a tooltip to a raw DOM element (e.g. heatmap cells).
// It lives beside `tooltip.tsx` rather than inside it so that file exports components
// only — mixing a hook in costs the module its Fast Refresh (`react/only-export-components`).

interface ImperativeTooltipState {
  content: ReactNode
  rect: DOMRect
}

export function useImperativeTooltip() {
  const [state, setState] = useState<ImperativeTooltipState | null>(null)

  const show = useCallback((content: ReactNode, element: HTMLElement) => {
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
