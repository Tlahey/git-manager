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
}

/** Natural center x of a lane's node inside the graph cell. */
export function laneCenterX(column: number): number {
  return column * COL_WIDTH + COL_WIDTH / 2
}

/** Inner (drawable) width needed so every lane up to `maxColumn` shows its marker in full. */
function neededInnerWidth(maxColumn: number, avatarSize: number): number {
  return laneCenterX(maxColumn) + avatarSize / 2 + FULL_RIGHT_PADDING
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
  avatarSize: number
): GraphColumnLayout {
  const innerWidth = columnWidth - GRAPH_CELL_TRAILING_MARGIN
  const deficit = neededInnerWidth(maxColumn, avatarSize) - innerWidth
  if (deficit <= 0) {
    return {
      mode: 'full',
      innerWidth,
      overlayStart: innerWidth,
      overlayOpacity: 0,
      linesOpacity: 1,
      compactBlend: 0,
    }
  }
  const overlayWidth = avatarSize + OVERLAY_PADDING
  const fullOverlayStart = innerWidth - overlayWidth
  const overlayOpacity = Math.min(1, deficit / OVERLAY_FADE_RANGE)
  if (fullOverlayStart >= COL_WIDTH) {
    // The zone slides in from the right: its width grows with the ramp up to `overlayWidth`.
    const overlayStart = Math.round((innerWidth - overlayWidth * overlayOpacity) * 100) / 100
    const linesOpacity =
      Math.round(Math.min(1, (fullOverlayStart - COL_WIDTH) / LINES_FADE_RANGE) * 100) / 100
    return { mode: 'overflow', innerWidth, overlayStart, overlayOpacity, linesOpacity, compactBlend: 0 }
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
  }
}

export interface MarkerPlacement {
  /** Cell-relative center x where the row's marker should render. */
  x: number
  /** True when the marker overlaps the overflow zone (its band tint is dropped). */
  overflowed: boolean
  /** 1 outside the zone, fading down to `OVERFLOWED_MARKER_OPACITY` as the marker travels
   * deeper under it — a marker slides at its natural position inside the zone until it reaches
   * the zone's right end, where it pins and rides along with the shrinking column. */
  opacity: number
}

export function getMarkerPlacement(
  nodeColumn: number,
  layout: GraphColumnLayout,
  avatarSize: number
): MarkerPlacement {
  const naturalX = laneCenterX(nodeColumn)
  if (layout.mode === 'full') return { x: naturalX, overflowed: false, opacity: 1 }

  // Overflow geometry: slide at the natural position until pinned shy of the right edge.
  const pinX = layout.innerWidth - avatarSize / 2 - PIN_GAP
  const slideX = Math.min(naturalX, pinX)
  const overlap = naturalX + avatarSize / 2 - layout.overlayStart
  const depth = Math.min(1, Math.max(0, overlap) / avatarSize)
  const dim = 1 - (1 - OVERFLOWED_MARKER_OPACITY) * depth

  // Blend continuously toward the centered, fully-opaque compact rendering (t = 0 outside
  // `compact`, so this is a no-op in `overflow`).
  const t = layout.compactBlend
  const x = Math.round((slideX + (layout.innerWidth / 2 - slideX) * t) * 100) / 100
  const opacity = Math.round((dim + (1 - dim) * t) * 100) / 100
  return { x, overflowed: overlap > 0, opacity }
}
