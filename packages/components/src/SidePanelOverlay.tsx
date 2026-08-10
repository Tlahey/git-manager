import type { ReactNode } from 'react'
import { Dialog, DialogContent } from '@git-manager/ui'
import { useHorizontalResize } from './useHorizontalResize'

export interface SidePanelOverlayProps {
  open: boolean
  /** Called on backdrop click, Escape, or the built-in close button. */
  onClose: () => void
  /** Prefix for the two `data-testid`s: `<prefix>-panel` and `<prefix>-resize`. */
  testIdPrefix: string
  /**
   * Initial, minimum and maximum width as fractions of the viewport width, resolved once when the
   * panel mounts. Fractions rather than pixels because the useful width of a side panel is a share
   * of the window, not a constant — the same 700px is roomy on a laptop and a sliver on a 5K display.
   */
  widthRatios?: { initial: number; min: number; max: number }
  /**
   * The panel's own content. **Must include a `DialogTitle`** (visually hidden if the design has no
   * visible heading): this is a modal surface, and Radix warns — rightly — about one with no
   * accessible name.
   */
  children: ReactNode
  /**
   * Whether to render the ✕ in the top-right corner. On by default; turn it off when the content
   * already fills that corner and offers its own way out — the Launchpad's PR panel wraps a screen
   * whose toolbar sits exactly there, and the ✕ landed on top of its buttons. Escape and the
   * backdrop still close the panel either way.
   */
  showCloseButton?: boolean
}

const DEFAULT_RATIOS = { initial: 0.6, min: 0.5, max: 0.95 }

/**
 * A right-anchored, full-height modal panel, resizable by dragging its left edge.
 *
 * Built on `DialogContent position="right"` rather than a hand-rolled overlay, which is what buys
 * the things a bespoke `absolute inset-0` div silently does without: a focus trap, Escape to close,
 * `aria-modal`, inert background content, and a portal that no ancestor's `overflow: hidden` or
 * stacking context can clip.
 *
 * Reach for this over a centered dialog when the content is a *list you scroll* rather than a
 * question you answer — a full-height column gives it the vertical room, and the caller lays out
 * its own header/scroll body/footer inside. Give the scrolling middle `min-h-0 flex-1`, never a
 * `max-h-[…]`: a percentage-height viewport inside a max-height box resolves to `auto`, grows with
 * its content, and produces a pane that is clipped and cannot be scrolled.
 */
export function SidePanelOverlay({
  open,
  onClose,
  testIdPrefix,
  widthRatios = DEFAULT_RATIOS,
  children,
  showCloseButton = true,
}: SidePanelOverlayProps) {
  const viewport = typeof window !== 'undefined' ? window.innerWidth : 1280
  const { width, resizeProps } = useHorizontalResize(
    Math.round(viewport * widthRatios.initial),
    Math.round(viewport * widthRatios.min),
    Math.round(viewport * widthRatios.max)
  )

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        position="right"
        style={{ width }}
        className="gap-0 p-0"
        showCloseButton={showCloseButton}
        data-testid={`${testIdPrefix}-panel`}
      >
        {/* Absolutely placed so the handle does not become a flex child and eat a strip of the
            panel's own layout. `DialogContent` is `fixed`, so it is the containing block. */}
        <div
          {...resizeProps}
          className="group absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize bg-border/40 transition-colors select-none hover:bg-primary/40"
          data-testid={`${testIdPrefix}-resize`}
        />
        {children}
      </DialogContent>
    </Dialog>
  )
}
