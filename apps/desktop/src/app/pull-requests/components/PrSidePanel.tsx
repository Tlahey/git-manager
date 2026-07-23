import { useHorizontalResize } from '@git-manager/components'
import { PrViewPanel } from './PrViewPanel'
import type { MockPR } from '../types'

interface PrSidePanelProps {
  pr: MockPR
  onClose: () => void
}

/**
 * The Launchpad PR view mounted as a resizable right-hand panel next to the list (rather than a
 * full-page takeover). Drag the left handle to resize; the panel never shrinks below 50% of the
 * viewport so the PR page keeps enough room, and it caps at 95% so a sliver of the list stays
 * visible. Width bounds are derived from `window.innerWidth` when the panel opens.
 */
export function PrSidePanel({ pr, onClose }: PrSidePanelProps) {
  const viewport = typeof window !== 'undefined' ? window.innerWidth : 1280
  const minWidth = Math.round(viewport * 0.5)
  const maxWidth = Math.round(viewport * 0.95)
  const { width, resizeProps } = useHorizontalResize(
    Math.round(viewport * 0.6),
    minWidth,
    maxWidth
  )

  return (
    <>
      <div
        {...resizeProps}
        className="group relative w-1.5 shrink-0 cursor-col-resize select-none bg-border/40 transition-colors hover:bg-primary/40"
        data-testid="launchpad-pr-panel-resize"
      />
      <div
        style={{ width }}
        className="flex h-full shrink-0 flex-col overflow-hidden border-l border-border bg-background"
        data-testid="launchpad-pr-panel"
      >
        <PrViewPanel pr={pr} onClose={onClose} />
      </div>
    </>
  )
}
