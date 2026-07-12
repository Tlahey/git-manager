import type { MergeBlock } from '../types'
import { type BlockPlacement, centerLinesForBlock } from '../mergeBlockLayout'

/** Rebuilds the full center-pane text from every block's current include flags — the bulk
 * actions (apply-non-conflicting, accept-all-left/right) replace the whole buffer with this
 * instead of stitching per-block range edits. Blocks without a placement fall back to their
 * base (ancestor) lines. */
export function buildCenterTextFromPlacements(
  blocks: MergeBlock[],
  placements: Map<number, BlockPlacement>
): string {
  const lines: string[] = []
  for (const block of blocks) {
    const placement = placements.get(block.blockId)
    if (placement) {
      lines.push(...centerLinesForBlock(block, placement.oursIncluded, placement.theirsIncluded))
    } else {
      lines.push(...(block.baseLines ?? []))
    }
  }
  return lines.join('\n')
}
