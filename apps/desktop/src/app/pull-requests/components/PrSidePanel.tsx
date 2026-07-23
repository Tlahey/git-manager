import { useHorizontalResize } from '@git-manager/components'
import { PrViewPanel } from './PrViewPanel'
import type { MockPR } from '../types'

interface PrSidePanelProps {
  pr: MockPR
  onClose: () => void
}

/**
 * The Launchpad PR view mounted as a right-hand overlay on top of the list. A dimmed backdrop covers
 * the list — clicking it closes the panel — and the panel is resizable via the handle on its left
 * edge, clamped between 50% and 95% of the viewport width. Bounds are derived from
 * `window.innerWidth` when the panel opens.
 */
export function PrSidePanel({ pr, onClose }: PrSidePanelProps) {
  const viewport = typeof window !== 'undefined' ? window.innerWidth : 1280
  const { width, resizeProps } = useHorizontalResize(
    Math.round(viewport * 0.65),
    Math.round(viewport * 0.5),
    Math.round(viewport * 0.95)
  )

  return (
    <div className="absolute inset-0 z-panel flex justify-end" data-testid="launchpad-pr-panel-overlay">
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
        onClick={onClose}
        data-testid="launchpad-pr-panel-backdrop"
      />
      <div
        {...resizeProps}
        className="group relative z-10 w-1.5 shrink-0 cursor-col-resize select-none bg-border/40 transition-colors hover:bg-primary/40"
        data-testid="launchpad-pr-panel-resize"
      />
      <div
        style={{ width }}
        className="relative z-10 flex h-full shrink-0 flex-col overflow-hidden border-l border-border bg-background shadow-2xl"
        data-testid="launchpad-pr-panel"
      >
        <PrViewPanel pr={pr} onClose={onClose} />
      </div>
    </div>
  )
}
