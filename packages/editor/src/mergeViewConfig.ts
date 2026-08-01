/**
 * Central configuration for the merge/diff view's tunable layout and visual constants — the
 * "knobs" that were previously scattered as inline literals across the resolver, its hooks, and
 * the connector overlay. Kept in one place so a value used in several modules (e.g. the
 * line-height fallback, which the geometry math, the overlay, and the connectors hook all need)
 * has a single source of truth and can't drift between call sites.
 *
 * Timing hacks that are effect-specific and intentionally different per site (the "belt and
 * suspenders" `scheduleRecompute` follow-up delays) are deliberately NOT centralized here —
 * they're local to the effect that owns them, not shared configuration.
 */

/** Fallback row height in px when Monaco hasn't reported its real `lineHeight` yet (before the
 * center editor has mounted). Monaco's own default is 19 at the default font size; every place
 * that reads `getOption(EditorOption.lineHeight)` falls back to this until the editor exists. */
export const DEFAULT_LINE_HEIGHT = 19

/** Width in px of each connector gap between panes — wide enough to fit the two accept/ignore
 * buttons side by side (see MergeConnectorOverlay) plus the ribbon curve. */
export const GAP_WIDTH = 40

/** Never let a pane shrink below this many pixels while dragging a gap resize handle. */
export const MIN_PANE_PX = 150

/** A long unchanged block keeps this many context lines visible at its top AND bottom when
 * collapsed — blocks with `lineCount <= 2 * COLLAPSE_CONTEXT_LINES` never collapse (there would
 * be nothing left to hide). */
export const COLLAPSE_CONTEXT_LINES = 3

/** Height (in editor lines) of the "N lines collapsed" banner view zone injected where the
 * hidden middle used to be. */
export const COLLAPSED_BANNER_HEIGHT_LINES = 1.5

/** Peak/trough offset (px) of the collapsed-region connector wave from its baseline. */
export const WAVE_AMPLITUDE = 5

/** Half the wavelength (px) of the collapsed-region connector wave — a full wave is 20px,
 * matching the pane banners' 20×20 CSS-mask tile so the two waves read as one continuous line. */
export const WAVE_HALF_PERIOD = 10

/** Extra Y offset (px) that pins a collapsed-region banner (and the connector wave threading
 * into it) to the top of the pane's viewport for as long as the user has scrolled into its span,
 * instead of letting it scroll past like a normal line. `naturalTop` is the banner's own
 * document-space top (Monaco's un-scrolled layout position); `height` is its rendered height.
 * Below `naturalTop` the correction is 0 (normal document-flow position, unmodified); once
 * `scrollTop` enters `[naturalTop, naturalTop + height]` the correction exactly cancels the
 * scroll offset, pinning the banner's on-screen position to 0; past that range the correction
 * stays clamped at `height`, which is a no-op in practice (the banner is already off-screen
 * above the viewport by then) — this keeps the function continuous with no jump at either
 * boundary, unlike a naive "reset to 0 once past" branch would produce. */
export function stickyTopCorrection(scrollTop: number, naturalTop: number, height: number): number {
  return Math.min(Math.max(scrollTop - naturalTop, 0), height)
}
