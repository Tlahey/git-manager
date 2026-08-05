import type { MergeBlock } from '../types'
import type { BlockPlacement } from '../mergeBlockLayout'

/** Extra lines kept live above and below the center pane's visible range, so word-level
 * highlights are already computed by the time a line scrolls into view. */
export const INTRA_LINE_OVERSCAN = 80

/** A range of center-pane line numbers, both bounds inclusive. */
export interface CenterLineRange {
  start: number
  end: number
}

/**
 * The blocks whose center-pane lines fall inside `range`.
 *
 * Exists for the intra-line (word-level) diff pass, which is the one piece of the merge view
 * whose cost is per *changed line* rather than per block: it runs a Myers diff on every
 * side↔center line pair. Over a whole file that is unbounded work — measured at 76ms for a diff
 * with 6000 hunks, on every placement change — and all of it produces highlights for lines nobody
 * is looking at. Scoped to the viewport it is bounded by the window height instead.
 *
 * Scoping it this way is honest rather than a threshold: the highlights are always exact for what
 * is on screen, at every size of diff, instead of silently switching off past some number.
 *
 * A block with no placement is dropped, matching what the compute functions themselves do with it.
 */
export function blocksInCenterRange(
  blocks: MergeBlock[],
  placements: Map<number, BlockPlacement>,
  range: CenterLineRange | null,
  overscan: number = INTRA_LINE_OVERSCAN
): MergeBlock[] {
  if (!range) return blocks

  const start = range.start - overscan
  const end = range.end + overscan

  return blocks.filter((block) => {
    const placement = placements.get(block.blockId)
    if (!placement) return false
    const blockStart = placement.centerStartLine
    // A zero-line block (a pending insertion, a deletion) still occupies a boundary at its start
    // line, so it must not be excluded for having no height.
    const blockEnd = placement.centerStartLine + Math.max(placement.centerLineCount, 1) - 1
    return blockEnd >= start && blockStart <= end
  })
}
