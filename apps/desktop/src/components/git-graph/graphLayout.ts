// Single source of truth for every tunable of the commit-graph column: lane spacing, the
// resizable graph column's sizing math, its overflow/compact behaviour, and the row band tints.
// Everything the graph's look-and-feel is dialled in with lives here so it can be tweaked in one
// place — importing modules (`GraphSvg`, `GraphRow`, `GraphCell`, `graphColumnSizing`,
// `columns`, `GitGraph`) should read these rather than hard-coding their own numbers. Kept in its
// own module (rather than exported from a component) so tests that mock those components still get
// the real values.

// ── Lane spacing ────────────────────────────────────────────────────────────────

/** Horizontal spacing between two adjacent graph lanes (column centers), in px. Shared by
 * `GraphSvg.tsx` (line geometry) and `GraphRow`/`GraphCell` (node/avatar positions) so they stay
 * in lockstep — change lane spacing here only. Must stay ≥ the avatar diameter's half plus a
 * couple px so an avatar never covers a neighbouring lane's line (avatar radius is 16 at standard
 * row height). */
export const COL_WIDTH = 22

// ── Graph column sizing ─────────────────────────────────────────────────────────

/** Trailing horizontal margin of the graph cell (`mx-2`) sitting between the cell's content box
 * and the column's colored right border — the drawable width is the column width minus this. */
export const GRAPH_CELL_TRAILING_MARGIN = 8

/** Minimum resizable width of the graph column (an avatar, some air, the trailing margin) —
 * `columns.ts` uses it as the column's `minWidth`, and the compact blend reaches 1 there. */
export const GRAPH_MIN_WIDTH = 48

/** Breathing room kept between the rightmost marker's edge and the column border in `full` mode —
 * generous enough that the last node/avatar never reads as glued to the column's right edge. */
export const GRAPH_FULL_RIGHT_PADDING = 8

/** Extra width of the overflow fade zone beyond the avatar itself. */
export const GRAPH_OVERLAY_PADDING = 8

/** Gap kept between a pinned marker's right edge and the drawable right edge (overflow mode). */
export const GRAPH_PIN_GAP = 6

// ── Overflow / compact behaviour ─────────────────────────────────────────────────

/** Missing width (px) over which the overflow zone fades in while the column shrinks. */
export const GRAPH_OVERLAY_FADE_RANGE = 24

/** Opacity of a marker fully buried under the overflow zone. */
export const GRAPH_OVERFLOWED_MARKER_OPACITY = 0.45

/** Room left of the zone (px) over which the connection lines fade out as the column approaches
 * the compact boundary — so they're already invisible when the mode flips, instead of vanishing
 * in one frame. One lane's worth by default. */
export const GRAPH_LINES_FADE_RANGE = COL_WIDTH

// ── Row band tints ──────────────────────────────────────────────────────────────

/** Opacity (hex alpha suffix appended to `node.color`) of the horizontal line connecting a ref
 * label (branch/tag) to its commit's node — except origin/main, which stays fully opaque. */
export const REF_CONNECTOR_LINE_OPACITY_HEX = '40'

/** Alpha (hex suffix) of the colored band behind a row, normal vs selected — the selected row
 * gets a much more vivid tint of its lane color. */
export const BAND_ALPHA_HEX = '15' // ~8% opacity
export const BAND_ALPHA_SELECTED_HEX = '45' // ~27% opacity
