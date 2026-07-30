// Pure sizing math for the resizable `graph` column. Three display modes depending on how the
// column width compares to the space the lanes actually need (see `getGraphColumnLayout`):
//
// - `full`     — every lane and marker fits: current behavior, nothing clamped.
// - `overflow` — the rightmost marker no longer fits: a card-like zone slides in from the right,
//                its width growing with the missing width (see `overlayOpacity`) until it reaches
//                one avatar + padding; markers keep their natural position — progressively dimmed
//                while they travel under the zone — until they reach its right end, where they
//                pin and ride along with it. Connection lines are clipped at the zone's edge.
// - `compact`  — minimum width: no lines at all, every row just shows its marker
//                (WIP ring / merge dot / avatar) centered in the column.
//
// On top of the mode, the column scrolls horizontally (`scrollX`): the lanes shift left by that
// many pixels so the ones hidden past the right zone can be brought into view. Scrolling is the
// exact counterpart of widening the column, so the right zone shrinks back as the user scrolls
// toward the lanes it was hiding — at maximum scroll it is gone entirely. A mirror zone forms on
// the left, with the same pinning/dimming/clipping rules and no shadow: it is pure geometry, so
// nothing renders for it (see `leftOverlayEnd` / `leftPinX`).
//
// All x positions are relative to the graph cell's content box (its left edge), matching how
// `GraphRow`/`GraphCell` position markers today.

// All tunable values come from the graph config module (`graphLayout.ts`); aliased to short local
// names here purely to keep the geometry math below readable.
import {
  COL_WIDTH,
  GRAPH_CELL_TRAILING_MARGIN,
  GRAPH_MIN_WIDTH,
  GRAPH_FULL_RIGHT_PADDING as FULL_RIGHT_PADDING,
  GRAPH_OVERLAY_PADDING as OVERLAY_PADDING,
  GRAPH_PIN_GAP as PIN_GAP,
  GRAPH_OVERLAY_FADE_RANGE as OVERLAY_FADE_RANGE,
  GRAPH_OVERFLOWED_MARKER_OPACITY as OVERFLOWED_MARKER_OPACITY,
  GRAPH_LINES_FADE_RANGE as LINES_FADE_RANGE,
} from './graphLayout'

export type GraphColumnMode = 'full' | 'overflow' | 'compact'

export interface GraphColumnLayout {
  mode: GraphColumnMode
  /** Drawable width in px: column width minus the trailing cell margin (the border sits there). */
  innerWidth: number
  /** Cell-relative x where the overflow zone starts. Equals `innerWidth` outside `overflow`; in
   * `overflow` it moves left progressively as the zone grows toward its full width. */
  overlayStart: number
  /** 0..1 growth of the overflow zone — ramps up with the missing width, driving both the zone's
   * width (it slides in from the right) and the opacity of its edge shadow. */
  overlayOpacity: number
  /** 0..1 opacity of the connection lines — 1 in `full`, ramping down to 0 as `overflow`
   * approaches the `compact` boundary (0 in `compact`, where they are not rendered at all). */
  linesOpacity: number
  /** 0 outside `compact`; in `compact`, ramps 0 → 1 from the mode boundary down to the minimum
   * width. Markers interpolate from their overflow position toward the column center with it, so
   * resizing across the boundary moves them continuously instead of snapping them centered. */
  compactBlend: number
  /** Applied horizontal scroll offset in px, already clamped to `[0, maxScrollX]` — lanes render
   * that many pixels left of their natural position. */
  scrollX: number
  /** Largest useful `scrollX`: the width missing to show every lane at once (0 in `full` mode,
   * where nothing is hidden and the column therefore doesn't scroll). */
  maxScrollX: number
  /** Cell-relative x where the left zone ends — the mirror of the right overflow zone, minus its
   * shadow. Grows from 0 with `scrollX` up to one avatar + padding; connection lines are clipped
   * here so they never run under a marker pinned on the left. */
  leftOverlayEnd: number
  /** Cell-relative center x where a marker scrolled off the left edge pins. Deliberately capped at
   * lane 0's own rest position, so an unscrolled column pins (and dims) nothing. */
  leftPinX: number
}

/** Extra left margin the whole graph needs when the avatar is wider than a lane: lane 0 sits at
 * `COL_WIDTH / 2` from the cell's own left edge — half the gap every *other* pair of lanes gets,
 * since there's no lane "-1" to share it with. At the standard row height (32px avatar, 16px
 * radius) that's only 11px, so the avatar overhangs the cell by 5px and gets clipped by the
 * neighboring column. Shifting every lane right by this amount keeps lane-to-lane spacing exactly
 * `COL_WIDTH` (nothing about the small-row-height math below changes) while giving lane 0 the same
 * clearance as everyone else. Zero once the avatar is small enough to fit unaided (small row
 * height: 12px radius ≤ 11px is still marginally over, by 1px — imperceptible, left as is). */
export function graphLeftInset(avatarSize: number): number {
  return Math.max(0, avatarSize / 2 - COL_WIDTH / 2)
}

/** Natural center x of a lane's node inside the graph cell. */
export function laneCenterX(column: number, avatarSize: number): number {
  return graphLeftInset(avatarSize) + column * COL_WIDTH + COL_WIDTH / 2
}

/** Inner (drawable) width needed so every lane up to `maxColumn` shows its marker in full. */
function neededInnerWidth(maxColumn: number, avatarSize: number): number {
  return laneCenterX(maxColumn, avatarSize) + avatarSize / 2 + FULL_RIGHT_PADDING
}

/** Column width beyond which widening the graph column gains nothing — used to cap resizing. */
export function getGraphMaxWidth(maxColumn: number, avatarSize: number): number {
  return neededInnerWidth(maxColumn, avatarSize) + GRAPH_CELL_TRAILING_MARGIN
}

/** True when `columnWidth` is too small to show even one lane next to the overflow zone —
 * the column then degrades to markers-only (`compact`) rendering. */
export function isGraphCompact(columnWidth: number, avatarSize: number): boolean {
  const innerWidth = columnWidth - GRAPH_CELL_TRAILING_MARGIN
  return innerWidth - (avatarSize + OVERLAY_PADDING) < COL_WIDTH
}

export function getGraphColumnLayout(
  columnWidth: number,
  maxColumn: number,
  avatarSize: number,
  requestedScrollX = 0
): GraphColumnLayout {
  const innerWidth = columnWidth - GRAPH_CELL_TRAILING_MARGIN
  const deficit = neededInnerWidth(maxColumn, avatarSize) - innerWidth
  const overlayWidth = avatarSize + OVERLAY_PADDING
  // Only the hidden width is scrollable, so `full` mode resolves to a non-scrollable column.
  const maxScrollX = Math.max(0, Math.round(deficit * 100) / 100)
  const scrollX = Math.min(Math.max(0, requestedScrollX), maxScrollX)
  const leftPinX = Math.min(avatarSize / 2 + PIN_GAP, laneCenterX(0, avatarSize))
  // The left zone slides in with the scroll, the same ramp the right one uses to slide in with the
  // missing width — so neither appears in a single frame.
  const leftOverlayEnd =
    Math.round(overlayWidth * Math.min(1, scrollX / OVERLAY_FADE_RANGE) * 100) / 100
  const scroll = { scrollX, maxScrollX, leftOverlayEnd, leftPinX }
  if (deficit <= 0) {
    return {
      mode: 'full',
      innerWidth,
      overlayStart: innerWidth,
      overlayOpacity: 0,
      linesOpacity: 1,
      compactBlend: 0,
      ...scroll,
    }
  }
  const fullOverlayStart = innerWidth - overlayWidth
  // The right zone stands for the lanes still hidden *to its right*: scrolling toward them consumes
  // the deficit exactly like widening the column does, so the zone recedes and finally disappears
  // once the last lane is on screen.
  const overlayOpacity = Math.min(1, (deficit - scrollX) / OVERLAY_FADE_RANGE)
  if (fullOverlayStart >= COL_WIDTH) {
    // The zone slides in from the right: its width grows with the ramp up to `overlayWidth`.
    const overlayStart = Math.round((innerWidth - overlayWidth * overlayOpacity) * 100) / 100
    const linesOpacity =
      Math.round(Math.min(1, (fullOverlayStart - COL_WIDTH) / LINES_FADE_RANGE) * 100) / 100
    return {
      mode: 'overflow',
      innerWidth,
      overlayStart,
      overlayOpacity,
      linesOpacity,
      compactBlend: 0,
      ...scroll,
    }
  }
  // Compact: keep every visual a continuous function of the width. `compactBlend` ramps from 0
  // (right at the boundary, where the geometry matches `overflow` exactly) to 1 at the minimum
  // width; the zone fades out with it and markers slide toward the column center.
  const boundaryInner = COL_WIDTH + avatarSize + OVERLAY_PADDING
  const minInner = GRAPH_MIN_WIDTH - GRAPH_CELL_TRAILING_MARGIN
  const compactBlend = Math.min(
    1,
    Math.max(0, (boundaryInner - innerWidth) / Math.max(1, boundaryInner - minInner))
  )
  return {
    mode: 'compact',
    innerWidth,
    overlayStart: Math.max(0, fullOverlayStart),
    overlayOpacity: Math.round(overlayOpacity * (1 - compactBlend) * 100) / 100,
    linesOpacity: 0,
    compactBlend,
    ...scroll,
  }
}

export interface MarkerPlacement {
  /** Cell-relative center x where the row's marker should render. */
  x: number
  /** True when the marker overlaps the right overflow zone (its band tint is dropped — the band
   * would live entirely under the zone). Deliberately false for a marker pinned on the *left*:
   * its band runs rightward, away from the left zone, so it stays tinted — only the segment
   * crossing that zone is cut, at `leftOverlayEnd`. */
  overflowed: boolean
  /** 1 outside the zones, fading down to `OVERFLOWED_MARKER_OPACITY` as the marker travels
   * deeper under one — a marker slides at its natural position inside the right zone until it
   * reaches its right end, where it pins and rides along with the shrinking column; on the left it
   * dims with how far the pin had to hold it back from the position the scroll asked for. */
  opacity: number
}

export function getMarkerPlacement(
  nodeColumn: number,
  layout: GraphColumnLayout,
  avatarSize: number
): MarkerPlacement {
  // Scrolling right moves every lane left by the same offset (0 in `full` mode).
  const naturalX = laneCenterX(nodeColumn, avatarSize) - layout.scrollX
  if (layout.mode === 'full') return { x: naturalX, overflowed: false, opacity: 1 }

  // Overflow geometry: slide at the natural position, pinned shy of the right edge on one side and
  // at lane 0's rest position on the other, so a lane scrolled off either edge stays visible.
  const pinX = layout.innerWidth - avatarSize / 2 - PIN_GAP
  const slideX = Math.min(Math.max(naturalX, layout.leftPinX), pinX)
  const overlap = naturalX + avatarSize / 2 - layout.overlayStart
  // Left mirror: measured against the pin rather than the zone's edge, so lane 0 sitting naturally
  // half-outside the cell at rest is not mistaken for a scrolled-away marker.
  const leftHidden = Math.max(0, layout.leftPinX - naturalX)
  const depth = Math.max(
    Math.min(1, Math.max(0, overlap) / avatarSize),
    Math.min(1, leftHidden / avatarSize)
  )
  const dim = 1 - (1 - OVERFLOWED_MARKER_OPACITY) * depth

  // Blend continuously toward the centered, fully-opaque compact rendering (t = 0 outside
  // `compact`, so this is a no-op in `overflow`).
  const t = layout.compactBlend
  const x = Math.round((slideX + (layout.innerWidth / 2 - slideX) * t) * 100) / 100
  const opacity = Math.round((dim + (1 - dim) * t) * 100) / 100
  return { x, overflowed: overlap > 0, opacity }
}
