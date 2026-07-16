/** Horizontal spacing between two adjacent graph lanes (column centers), in px. Shared by
 * `GraphSvg.tsx` (line geometry) and `GraphRow.tsx` (node/avatar positions) so they stay in
 * lockstep — this is the single source of truth for lane spacing, change it here only. Kept in
 * its own module (rather than exported from `GraphSvg`) so tests that mock `GraphSvg` still get
 * the real value. Must stay ≥ the avatar diameter's half plus a couple px so an avatar never
 * covers a neighbouring lane's line (avatar radius is 16 at standard row height). */
export const COL_WIDTH = 22
