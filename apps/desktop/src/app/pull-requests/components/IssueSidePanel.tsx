import { useHorizontalResize } from '@git-manager/components'
import { IssueViewPanel } from './IssueViewPanel'
import type { MockIssue } from '../types'

interface IssueSidePanelProps {
  issue: MockIssue
  onClose: () => void
  onChanged?: () => void
}

/**
 * The Launchpad issue view mounted as a right-hand overlay on top of the list — the issue-side twin
 * of {@link PrSidePanel}. A dimmed backdrop closes it on click; the panel is resizable via the handle
 * on its left edge, clamped between 50% and 95% of the viewport width.
 */
export function IssueSidePanel({ issue, onClose, onChanged }: IssueSidePanelProps) {
  const viewport = typeof window !== 'undefined' ? window.innerWidth : 1280
  const { width, resizeProps } = useHorizontalResize(
    Math.round(viewport * 0.6),
    Math.round(viewport * 0.5),
    Math.round(viewport * 0.95)
  )

  return (
    <div
      className="absolute inset-0 z-panel flex justify-end"
      data-testid="launchpad-issue-panel-overlay"
    >
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
        onClick={onClose}
        data-testid="launchpad-issue-panel-backdrop"
      />
      <div
        {...resizeProps}
        className="group relative z-10 w-1.5 shrink-0 cursor-col-resize select-none bg-border/40 transition-colors hover:bg-primary/40"
        data-testid="launchpad-issue-panel-resize"
      />
      <div
        style={{ width }}
        className="relative z-10 flex h-full shrink-0 flex-col overflow-hidden border-l border-border bg-background shadow-2xl"
        data-testid="launchpad-issue-panel"
      >
        <IssueViewPanel issue={issue} onClose={onClose} onChanged={onChanged} />
      </div>
    </div>
  )
}
