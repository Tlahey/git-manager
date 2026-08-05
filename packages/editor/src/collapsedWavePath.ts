import { WAVE_AMPLITUDE, WAVE_HALF_PERIOD } from './mergeViewConfig'

// Pure SVG-path geometry for the collapsed-region connector, kept out of
// `MergeConnectorOverlay.tsx` so that file exports components only — a module mixing the two
// loses Vite's Fast Refresh (`react/only-export-components`). No React here on purpose:
// every function below is a plain number-in/string-out unit its tests can call directly.

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
export function buildCollapsedWavePath(
  y0: number,
  y1: number,
  width: number,
  phaseOffset = 0
): string {
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
  let up = ((periodIndex % 2) + 2) % 2 === 0
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
    segments.push(
      `Q ${xMid.toFixed(2)},${controlY.toFixed(2)} ${xEnd.toFixed(2)},${endY.toFixed(2)}`
    )
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
  return (
    2 * arcOffset(localMid, sign) - (arcOffset(localStart, sign) + arcOffset(localEnd, sign)) / 2
  )
}
