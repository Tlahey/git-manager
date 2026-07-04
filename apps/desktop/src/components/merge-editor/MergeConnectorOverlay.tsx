import { forwardRef } from 'react'

export interface ConnectorSegment {
  id: number
  leftY0: number
  leftY1: number
  rightY0: number
  rightY1: number
  colorClass: string
  /** Whether this side's decision is still open. The ribbon itself always renders (gray once
   * settled, so the link stays visible), but the accept/ignore buttons only make sense while
   * there's still a decision to make — once made, they disappear rather than lingering. */
  actionable: boolean
}

interface MergeConnectorOverlayProps {
  width: number
  height: number
  segments: ConnectorSegment[]
  /** Which gap this overlay renders: 'left' = ours↔center, 'right' = center↔theirs. Only
   * controls button order/icon direction — "accept" always sits closer to the center pane
   * (the side its content flows into), "ignore" always sits further out. */
  side: 'left' | 'right'
  onAccept: (blockId: number) => void
  onReject: (blockId: number) => void
}

/** Filled "ribbon" connectors linking a block's Y-range in one pane to its Y-range in the
 * adjacent pane — adapted from the git graph's own edge-drawing technique (`GraphSvg.tsx`,
 * deterministic coordinate math + smooth Bézier joins), just as a filled quadrilateral between
 * two Y-ranges instead of a stroked line between two points.
 *
 * Accept/ignore action buttons live here too, in the gap itself, rather than as Monaco gutter
 * decorations inside a pane. This is deliberately the *simpler* option: plain HTML `<button>`s
 * with real `onClick`, no fighting with Monaco's own mouse-target hit-testing (which — see the
 * git history on this file — silently breaks the moment a pane's gutter is CSS-repositioned,
 * since Monaco computes "did you click the margin" from its own internal, unflipped layout
 * numbers rather than the actual rendered DOM). The ribbon is still SVG; the buttons are a
 * plain sibling overlay `<div>`, not a `<foreignObject>` — avoids foreignObject's own hit-testing
 * quirks across browsers for the sake of a couple of small buttons.
 *
 * `segments` are in *document* space (Monaco's own `getTopForLineNumber`, unadjusted for scroll),
 * not viewport space — the exposed `ref` is the outer wrapper that `ThreeWayMergeEditor` shifts
 * with a `translateY` transform written directly to the DOM on every Monaco scroll event. Doing
 * the scroll-following as a transform mutation (outside React) rather than recomputing `top`
 * values through state on every scroll tick is what keeps this overlay glued to the panes' own
 * (React-external) scrolling instead of trailing it by a render cycle. */
export const MergeConnectorOverlay = forwardRef<HTMLDivElement, MergeConnectorOverlayProps>(function MergeConnectorOverlay(
  { width, height, segments, side, onAccept, onReject },
  ref
) {
  return (
    <div ref={ref} className="absolute inset-0">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="pointer-events-none absolute inset-0 overflow-visible"
      >
        {segments.map((seg) => {
          const half = width / 2
          const d = [
            `M 0,${seg.leftY0}`,
            `C ${half},${seg.leftY0} ${half},${seg.rightY0} ${width},${seg.rightY0}`,
            `L ${width},${seg.rightY1}`,
            `C ${half},${seg.rightY1} ${half},${seg.leftY1} 0,${seg.leftY1}`,
            'Z',
          ].join(' ')
          return <path key={seg.id} d={d} className={seg.colorClass} data-testid={`merge-connector-ribbon-${side}-${seg.id}`} />
        })}
      </svg>
      {segments
        .filter((seg) => seg.actionable)
        .map((seg) => {
          const midY = ((seg.leftY0 + seg.leftY1) / 2 + (seg.rightY0 + seg.rightY1) / 2) / 2
          const acceptButton = (
            <button
              key="accept"
              type="button"
              className={side === 'left' ? 'merge-connector-action merge-connector-accept-ours' : 'merge-connector-action merge-connector-accept-theirs'}
              aria-label={side === 'left' ? 'Accept current change' : 'Accept incoming change'}
              data-testid={`merge-connector-accept-${side}-${seg.id}`}
              onClick={() => onAccept(seg.id)}
            />
          )
          const rejectButton = (
            <button
              key="reject"
              type="button"
              className="merge-connector-action merge-connector-reject"
              aria-label="Ignore this change"
              data-testid={`merge-connector-reject-${side}-${seg.id}`}
              onClick={() => onReject(seg.id)}
            />
          )
          return (
            <div
              key={seg.id}
              className="absolute left-0 right-0 flex -translate-y-1/2 items-center justify-center gap-0.5"
              style={{ top: midY }}
            >
              {side === 'left' ? [rejectButton, acceptButton] : [acceptButton, rejectButton]}
            </div>
          )
        })}
    </div>
  )
})
