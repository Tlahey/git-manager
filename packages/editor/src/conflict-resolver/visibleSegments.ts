import type { ConnectorSegment } from '../MergeConnectorOverlay'

/** Extra pixels of connector kept live above and below the gap's visible band, so a ribbon is
 * already in the DOM by the time it scrolls into view rather than popping in at the edge. */
export const SEGMENT_OVERSCAN_PX = 300

/** A contiguous slice of the segment array, as inclusive/exclusive indices into it. */
export interface SegmentWindow {
  start: number
  end: number
}

export const EMPTY_SEGMENT_WINDOW: SegmentWindow = { start: 0, end: 0 }

export function sameSegmentWindow(a: SegmentWindow, b: SegmentWindow): boolean {
  return a.start === b.start && a.end === b.end
}

/**
 * The slice of `segments` that can currently be seen in a gap.
 *
 * Connectors are the one part of the merge view that was never bounded: the overlay kept one SVG
 * `<path>` per change block in the DOM, and `updateConnectorPaths` rewrote every one of their `d`
 * attributes on **every scroll event**. On a diff with thousands of hunks (a regenerated lockfile
 * is the everyday case) that is thousands of path strings rebuilt and re-rasterized per frame,
 * which on its own overruns the frame budget — measured at ~14.5ms of string building alone for
 * 6000 hunks, before the browser rasterizes anything.
 *
 * A segment spans two panes that scroll together but not identically, so visibility is tested
 * against both ends and the union taken. Blocks are emitted in file order, so the result is always
 * a contiguous range — which is what lets the overlay render a plain `slice()` and keeps
 * `updateConnectorPaths`'s "paths are matched by document order" contract intact.
 *
 * The scan itself is linear over all segments, deliberately: a few thousand numeric comparisons
 * are nothing (~0.02ms), and the cost being removed is DOM work, not arithmetic. Anything cleverer
 * would have to stay correct as placements move segments around.
 */
export function visibleSegmentWindow(
  segments: ConnectorSegment[],
  scrollTopLeft: number,
  scrollTopRight: number,
  viewportHeight: number,
  overscan: number = SEGMENT_OVERSCAN_PX
): SegmentWindow {
  if (segments.length === 0) return EMPTY_SEGMENT_WINDOW

  const top = -overscan
  const bottom = viewportHeight + overscan

  let start = -1
  let end = -1

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const leftTop = segment.leftY0 - scrollTopLeft
    const leftBottom = segment.leftY1 - scrollTopLeft
    const rightTop = segment.rightY0 - scrollTopRight
    const rightBottom = segment.rightY1 - scrollTopRight

    // The ribbon is a filled shape spanning both ends, so it is on screen as soon as the band
    // between its highest and lowest point overlaps the viewport — testing each end separately
    // would drop a steeply sloped ribbon whose two ends straddle the visible band.
    const segmentTop = Math.min(leftTop, rightTop)
    const segmentBottom = Math.max(leftBottom, rightBottom)

    if (segmentBottom < top || segmentTop > bottom) continue

    if (start === -1) start = i
    end = i + 1
  }

  if (start === -1) return EMPTY_SEGMENT_WINDOW
  return { start, end }
}
