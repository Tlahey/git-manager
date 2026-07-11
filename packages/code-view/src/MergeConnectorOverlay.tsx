import { forwardRef } from 'react'
import { setCollapsedBlockHover } from './conflict-resolver/collapsedRegions'
import { DEFAULT_LINE_HEIGHT, WAVE_AMPLITUDE, WAVE_HALF_PERIOD } from './mergeViewConfig'

/** The collapsed-region connector's own version of the wavy line each pane's banner draws via a
 * CSS mask — built from the *same* alternating-quadratic-Bezier curve family as that mask
 * (`M0,10 Q5,5 10,10 T20,10`: an up-arc from (0,10) to (10,10) via control (5,5), then — since
 * `T` reflects the previous control point through (10,10) — a down-arc to (20,10) via control
 * (15,15), repeating), generalized so the baseline interpolates from y0 at x=0 to y1 at x=width
 * instead of staying flat. A CSS mask can't be reused directly here: it tiles relative to the
 * element's axis-aligned bounding box, which balloons in height (and drags the wave off-center)
 * once the two ends sit at different Y — exactly the staggered case this connector exists for.
 * Sampling the same curve family directly in document space instead keeps the two waves reading
 * as one continuous line threading through the gap, not two different decorations — a plain
 * sine has the same rough amplitude/wavelength but a visibly different curve shape.
 *
 * `phaseOffset` is this gap's own left edge relative to the same shared container the pane
 * banners' --wave-offset is measured against (see the "Align wave phases" effect in
 * ConflictResolver.tsx): containerX = localX + phaseOffset. Without it, every gap's wave starts
 * its up/down alternation fresh at its own local x=0, which only coincidentally lines up with
 * where the adjacent pane's wave left off — the mismatch shows up as a visible kink right where
 * a pane's banner meets the connector. Segment breaks land on shared-phase boundaries (multiples
 * of WAVE_HALF_PERIOD in container space) instead, so the first and/or last segment is often a
 * partial half-period — see partialArcControlYOffset for how its control point is computed. */
export function buildCollapsedWavePath(y0: number, y1: number, width: number, phaseOffset = 0): string {
  const baseline = (localX: number) => y0 + (y1 - y0) * (localX / width)

  // How far into its own half-period local wave-x=0 already sits, e.g. 6.66 means the first
  // segment picks up 6.66 units into what would otherwise be a full 10-unit arc. Snapped to
  // exactly 0 within a tight epsilon (not the ~0.01 an earlier version used) — that coarser
  // epsilon could overshoot an entire period whenever phaseOffset % WAVE_HALF_PERIOD landed
  // anywhere within 0.01 of a boundary (very plausible with real sub-pixel
  // getBoundingClientRect measurements), producing a first segment with localEnd up to 2×
  // WAVE_HALF_PERIOD — double the range partialArcControlYOffset assumes, which is what caused
  // the visible "edge effect" whenever real layout happened to land close to a period boundary.
  const EPS = 1e-6
  let periodIndex = Math.floor(phaseOffset / WAVE_HALF_PERIOD)
  let localStart = phaseOffset - periodIndex * WAVE_HALF_PERIOD
  if (localStart > WAVE_HALF_PERIOD - EPS) {
    periodIndex += 1
    localStart = 0
  } else if (localStart < EPS) {
    localStart = 0
  }

  const breaks: number[] = []
  let nextBreak = localStart === 0 ? WAVE_HALF_PERIOD : WAVE_HALF_PERIOD - localStart
  while (nextBreak < width - EPS) {
    breaks.push(nextBreak)
    nextBreak += WAVE_HALF_PERIOD
  }
  breaks.push(width)

  const segments: string[] = []
  let x = 0
  let currentLocalStart = localStart
  let up = (((periodIndex % 2) + 2) % 2) === 0
  // The path's own start (local x=0) sits ON the baseline only when localStart is exactly 0 (a
  // period boundary). Any other phase means this gap begins mid-arc — most visibly right at a
  // peak/trough — so the starting point itself needs the same arc-relative offset the control
  // point math below already accounts for; leaving it at the bare baseline (as an earlier
  // version did) opened a real, up-to-full-amplitude vertical gap between this path's own
  // endpoints and the adjacent pane's wave at that exact container position.
  const startY = baseline(0) + arcOffset(localStart, up ? -1 : 1)
  for (const xEnd of breaks) {
    if (xEnd - x < EPS) continue
    const sign = up ? -1 : 1
    const localEnd = currentLocalStart + (xEnd - x)
    const xMid = (x + xEnd) / 2
    const controlY = baseline(xMid) + partialArcControlYOffset(currentLocalStart, localEnd, sign)
    // Same reasoning as startY, applied to this segment's own endpoint: a no-op for every
    // segment except the last (interior breaks always land exactly on a period boundary, where
    // arcOffset is 0 by construction — only the final segment, ending at the gap's fixed
    // `width` rather than a period boundary, can have a nonzero localEnd here).
    const endY = baseline(xEnd) + arcOffset(localEnd, sign)
    segments.push(`Q ${xMid.toFixed(2)},${controlY.toFixed(2)} ${xEnd.toFixed(2)},${endY.toFixed(2)}`)
    x = xEnd
    currentLocalStart = 0
    up = !up
  }
  return `M 0,${startY.toFixed(2)} ${segments.join(' ')}`
}

/** Baseline-relative Y offset of the full (non-partial) half-period arc — local coordinates 0 to
 * WAVE_HALF_PERIOD, baseline-to-baseline, peak/trough at the midpoint — at an arbitrary point
 * `localX` along it. Derived from the same De Casteljau split as partialArcControlYOffset below:
 * since this arc's three control points (0,0), (H/2,peak), (H,0) have evenly-spaced X, x(t) is
 * exactly linear (x = t·H), which lets y(t) = 2·peak·t·(1−t) stand in for the usual x/y split. */
function arcOffset(localX: number, sign: number): number {
  const peak = sign * WAVE_AMPLITUDE
  const t = localX / WAVE_HALF_PERIOD
  return 2 * peak * t * (1 - t)
}

/** Control-point Y offset (from baseline) for a quadratic-Bezier arc covering only
 * [localStart, localEnd] of one full half-period arc — NOT simply ±WAVE_AMPLITUDE except when
 * the full [0, WAVE_HALF_PERIOD] range is covered. A half-period arc that starts or ends
 * mid-flight (the wave's own leading/trailing edge, whenever phase alignment doesn't land
 * exactly on a period boundary) needs a *smaller* control offset, matching how gently the
 * original full arc was actually moving through that sub-range — using the full amplitude for a
 * short partial segment instead produces a visibly steeper, pointier arc than the smooth
 * full-period ones (the wave looking "not fully sinusoidal" right at its own ends).
 *
 * For any two points on the full arc, the quadratic Bezier reproducing just that sub-arc — with
 * endpoints arcOffset(localStart) and arcOffset(localEnd), same as the path itself now draws —
 * has control-Y 2·y(mid) − (y(start)+y(end))/2, the amount needed to "undo" the
 * endpoint-averaging a Bezier control point otherwise contributes. */
function partialArcControlYOffset(localStart: number, localEnd: number, sign: number): number {
  const localMid = (localStart + localEnd) / 2
  return 2 * arcOffset(localMid, sign) - (arcOffset(localStart, sign) + arcOffset(localEnd, sign)) / 2
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
  /** Number of hidden lines this collapsed-region segment represents (colorClass ===
   * 'merge-connector-collapsed' only) — shown in the ribbon's tooltip. */
  collapsedCount?: number
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
  /** This gap's own left edge relative to the same container the pane banners' --wave-offset is
   * measured against — see buildCollapsedWavePath's phaseOffset param. Keeps the collapsed
   * connector's wave phase-locked to the banners' wave instead of restarting its own phase at
   * this gap's local x=0. */
  wavePhaseOffset?: number
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
  {
    width,
    height,
    segments,
    side,
    onAccept,
    onReject,
    scrollTopLeft = 0,
    scrollTopRight = 0,
    lineHeight = DEFAULT_LINE_HEIGHT,
    onExpandBlock,
    wavePhaseOffset = 0,
  },
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
          const half = width / 2
          const resolvedSuffix = seg.resolved ? ' merge-resolved' : ''

          const leftY0 = seg.leftY0 - scrollTopLeft
          const leftY1 = seg.leftY1 - scrollTopLeft
          const rightY0 = seg.rightY0 - scrollTopRight
          const rightY1 = seg.rightY1 - scrollTopRight

          if (seg.colorClass === 'merge-connector-collapsed') {
            // Same quadrilateral+Bezier construction as the general ribbon below: when the
            // collapsed region sits at different line positions in the two panes either side of
            // this gap, the (invisible — see merge-connector-collapsed-fill) hit-target slopes
            // smoothly between them instead of assuming they line up. The wave
            // (buildCollapsedWavePath) threads through the vertical middle, continuing each pane
            // banner's own wave across the gap instead of leaving a plain filled shape between
            // them.
            const d = [
              `M 0,${leftY0}`,
              `C ${half},${leftY0} ${half},${rightY0} ${width},${rightY0}`,
              `L ${width},${rightY1}`,
              `C ${half},${rightY1} ${half},${leftY1} 0,${leftY1}`,
              'Z',
            ].join(' ')
            const dWave = buildCollapsedWavePath((leftY0 + leftY1) / 2, (rightY0 + rightY1) / 2, width, wavePhaseOffset)
            return (
              <g
                key={seg.id}
                data-collapsed-block-id={seg.id}
                data-testid={`merge-connector-collapsed-${side}-${seg.id}`}
                onClick={() => onExpandBlock?.(seg.id)}
                onMouseEnter={() => setCollapsedBlockHover(seg.id, true)}
                onMouseLeave={() => setCollapsedBlockHover(seg.id, false)}
              >
                <path d={d} className="merge-connector-collapsed-fill" />
                <path d={dWave} className="merge-connector-collapsed-wave" />
              </g>
            )
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
    </div>
  )
})
