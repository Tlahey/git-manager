import type { ReactNode } from 'react'

interface GraphSidePanelProps {
  /** Spread on the drag handle — see `useHorizontalResize`. */
  resizeProps: {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void
  }
  width: number
  children: ReactNode
}

/**
 * The graph's right-hand panel: a draggable resize handle plus the fixed-width panel body next to
 * it. Every one of GitGraph's mutually-exclusive side panels (bisect, AI, patch workspace, package
 * health, PR files, commit/conflict details) repeated this exact markup — extracted (2026-08
 * retrofit, see architecture-guardian skill's R3) since duplicating markup 6 times over is its own
 * kind of drift risk: a future style tweak would need to remember to touch all 6.
 */
export function GraphSidePanel({ resizeProps, width, children }: GraphSidePanelProps) {
  return (
    <>
      <div
        {...resizeProps}
        className="group relative w-2 shrink-0 cursor-col-resize select-none transition-colors hover:bg-primary/40"
      >
        <div className="absolute inset-y-0 left-0.5 w-px bg-border transition-colors group-hover:bg-primary/60" />
      </div>
      <div className="h-full min-w-[350px] shrink-0 overflow-hidden" style={{ width }}>
        {children}
      </div>
    </>
  )
}
