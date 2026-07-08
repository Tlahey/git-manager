import { forwardRef } from 'react'

function setCollapsedBlockHover(blockId: number, active: boolean) {
  const elements = document.querySelectorAll(`[data-collapsed-block-id="${blockId}"]`)
  elements.forEach((el) => {
    if (active) {
      el.classList.add('is-hovered')
    } else {
      el.classList.remove('is-hovered')
    }
  })
}

export interface ConnectorSegment {
  id: number
  leftY0: number
  leftY1: number
  rightY0: number
  rightY1: number
  colorClass: string
  /** Whether this side's decision is still open. The ribbon itself always renders (gray once
   * settled, so the link stays visible), but the accept/ignore buttons only appear while
   * there's a decision to make AND this gap's pane is the change's source (see
   * `isChangeSource` in mergeBlockLayout.ts) — WebStorm never puts buttons on the pane that
   * merely mirrors the untouched ancestor. */
  actionable: boolean
  /** Both ends are zero-height (the pane a pure insertion is absent from, before it's pulled
   * in): rendered as a thin stroked line instead of a filled ribbon, continuing the
   * insertion's boundary marker across the gap into one unbroken line across the screen. */
  flat?: boolean
  resolved?: boolean
}

interface MergeConnectorOverlayProps {
  width: number
  height: number
  segments: ConnectorSegment[]
  /** Which gap this overlay renders: 'left' = theirs↔center (the incoming side), 'right' =
   * center↔ours (the current side) — matching the WebStorm pane order (incoming on the left,
   * local code on the right). Controls the accept icon direction (always pointing toward the
   * center pane), the action labels, and which edge the buttons hug (the source pane's). */
  side: 'left' | 'right'
  onAccept: (blockId: number) => void
  onReject: (blockId: number) => void
  scrollTopLeft?: number
  scrollTopRight?: number
  lineHeight?: number
  onExpandBlock?: (blockId: number) => void
}

/** Filled "ribbon" connectors linking a block's Y-range in one pane to its Y-range in the
 * adjacent pane — adapted from the git graph's own edge-drawing technique (`GraphSvg.tsx`,
 * deterministic coordinate math + smooth Bézier joins), just as a filled quadrilateral between
 * two Y-ranges instead of a stroked line between two points. A `flat` segment (both ends
 * zero-height) renders as an open stroked curve instead — a hairline continuing an insertion's
 * boundary marker across the gap.
 *
 * Accept/ignore action buttons live here too, in the gap itself, rather than as Monaco gutter
 * decorations inside a pane. This is deliberately the *simpler* option: plain HTML `<button>`s
 * with real `onClick`, no fighting with Monaco's own mouse-target hit-testing (which — see the
 * git history on this file — silently breaks the moment a pane's gutter is CSS-repositioned,
 * since Monaco computes "did you click the margin" from its own internal, unflipped layout
 * numbers rather than the actual rendered DOM). The buttons are anchored WebStorm-style at the
 * very start of the connector: glued to the source pane's edge of the gap, level with the
 * block's first line — not floating in the middle of the gap.
 *
 * `segments` are in *document* space (Monaco's own `getTopForLineNumber`, unadjusted for scroll),
 * not viewport space — the exposed `ref` is the outer wrapper that `ThreeWayMergeEditor` shifts
 * with a `translateY` transform written directly to the DOM on every Monaco scroll event. Doing
 * the scroll-following as a transform mutation (outside React) rather than recomputing `top`
 * values through state on every scroll tick is what keeps this overlay glued to the panes' own
 * (React-external) scrolling instead of trailing it by a render cycle. */
export const MergeConnectorOverlay = forwardRef<HTMLDivElement, MergeConnectorOverlayProps>(function MergeConnectorOverlay(
  { width, height, segments, side, onAccept, onReject, scrollTopLeft = 0, scrollTopRight = 0, lineHeight = 19, onExpandBlock },
  ref
) {
  return (
    <div ref={ref} className="merge-connector-overlay absolute inset-0">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="pointer-events-none absolute inset-0 overflow-visible"
      >
        {segments.map((seg) => {
          console.log('SEGMENT IN SVG:', seg.id, seg.colorClass, seg.leftY0, seg.leftY1)
          const half = width / 2
          const resolvedSuffix = seg.resolved ? ' merge-resolved' : ''

          const leftY0 = seg.leftY0 - scrollTopLeft
          const leftY1 = seg.leftY1 - scrollTopLeft
          const rightY0 = seg.rightY0 - scrollTopRight
          const rightY1 = seg.rightY1 - scrollTopRight

          if (seg.colorClass === 'merge-connector-collapsed') {
            return null
          }

          if (seg.flat) {
            const d = `M 0,${leftY0} C ${half},${leftY0} ${half},${rightY0} ${width},${rightY0}`
            return (
              <path
                key={seg.id}
                d={d}
                className={`${seg.colorClass} merge-connector-flat${resolvedSuffix}`}
                data-testid={`merge-connector-ribbon-${side}-${seg.id}`}
              />
            )
          }
          if (seg.resolved) {
            const dTop = `M 0,${leftY0 + 1} C ${half},${leftY0 + 1} ${half},${rightY0 + 1} ${width},${rightY0 + 1}`
            const dBottom = `M 0,${leftY1 - 1} C ${half},${leftY1 - 1} ${half},${rightY1 - 1} ${width},${rightY1 - 1}`
            return (
              <g key={seg.id}>
                <path
                  d={dTop}
                  className={`${seg.colorClass} merge-connector-edge merge-resolved`}
                  data-testid={`merge-connector-ribbon-${side}-${seg.id}-top`}
                />
                <path
                  d={dBottom}
                  className={`${seg.colorClass} merge-connector-edge merge-resolved`}
                  data-testid={`merge-connector-ribbon-${side}-${seg.id}-bottom`}
                />
              </g>
            )
          }
          const d = [
            `M 0,${leftY0}`,
            `C ${half},${leftY0} ${half},${rightY0} ${width},${rightY0}`,
            `L ${width},${rightY1}`,
            `C ${half},${rightY1} ${half},${leftY1} 0,${leftY1}`,
            'Z',
          ].join(' ')
          return <path key={seg.id} d={d} className={seg.colorClass} data-testid={`merge-connector-ribbon-${side}-${seg.id}`} />
        })}
      </svg>
      {segments
        .filter((seg) => seg.actionable)
        .map((seg) => {
          // Anchored at the connector's start: level with the top of the block on the SOURCE
          // pane's end of the segment (the left pane for the left gap, the right pane for the
          // right gap), hugging that pane's edge horizontally. An 18px button on an ~18px line
          // sits flush with the block's first line, exactly where WebStorm nests its actions.
          const anchorY = side === 'left' ? seg.leftY0 - scrollTopLeft : seg.rightY0 - scrollTopRight
          const acceptButton = (
            <button
              key="accept"
              type="button"
              className={
                side === 'left'
                  ? 'merge-connector-action merge-connector-accept-from-left'
                  : 'merge-connector-action merge-connector-accept-from-right'
              }
              aria-label={side === 'left' ? 'Accept incoming change' : 'Accept current change'}
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
              className={`merge-connector-action-container absolute left-0 right-0 flex items-center gap-0.5 ${side === 'left' ? 'justify-start pl-0.5' : 'justify-end pr-0.5'}`}
              style={{ top: anchorY, height: lineHeight }}
            >
              {/* Accept sits closest to the source pane's edge, the ignore X right after it. */}
              {side === 'left' ? [acceptButton, rejectButton] : [rejectButton, acceptButton]}
            </div>
          )
        })}
      {segments
        .filter((seg) => seg.colorClass === 'merge-connector-collapsed')
        .map((seg) => {
          const anchorY = side === 'left' ? seg.leftY0 - scrollTopLeft : seg.rightY0 - scrollTopRight
          return (
            <div
              key={seg.id}
              className="monaco-collapsed-zone-banner"
              data-collapsed-block-id={seg.id}
              style={{
                top: anchorY,
                height: 1.5 * lineHeight,
                pointerEvents: 'auto',
                zIndex: 10,
              }}
              onClick={() => onExpandBlock?.(seg.id)}
              onMouseEnter={() => setCollapsedBlockHover(seg.id, true)}
              onMouseLeave={() => setCollapsedBlockHover(seg.id, false)}
            />
          )
        })}
    </div>
  )
})
