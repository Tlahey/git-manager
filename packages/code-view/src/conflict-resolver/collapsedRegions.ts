import type { MergeBlock } from '../types'
import type { BlockPlacement } from '../mergeBlockLayout'
import { COLLAPSE_CONTEXT_LINES, COLLAPSED_BANNER_HEIGHT_LINES } from '../mergeViewConfig'

export type PaneSide = 'ours' | 'theirs' | 'center'

/** One collapsed middle-of-an-unchanged-block region in a single pane's own line space. */
export interface CollapsedRegion {
  blockId: number
  /** First hidden line (1-based, inclusive). */
  startHide: number
  /** Last hidden line (1-based, inclusive). */
  endHide: number
  /** How many lines the region hides (`endHide - startHide + 1`). */
  collapsedCount: number
}

/** The collapsed region for one pane-range, or `null` when the range is too short to collapse. */
export function collapsedRegionForRange(blockId: number, startLine: number, lineCount: number): CollapsedRegion | null {
  if (lineCount <= 2 * COLLAPSE_CONTEXT_LINES) return null
  const startHide = startLine + COLLAPSE_CONTEXT_LINES
  const endHide = startLine + lineCount - COLLAPSE_CONTEXT_LINES - 1
  return { blockId, startHide, endHide, collapsedCount: endHide - startHide + 1 }
}

/** All collapsed regions for one pane: every `unchanged` block that isn't manually expanded and
 * is long enough to hide a middle. The center pane reads its geometry from the block's live
 * placement (its lines move as other blocks resolve); the side panes use the block's own fixed
 * range. */
export function collapsedRegionsForPane(
  blocks: MergeBlock[],
  placements: Map<number, BlockPlacement>,
  expandedBlocks: Set<number>,
  side: PaneSide
): CollapsedRegion[] {
  const regions: CollapsedRegion[] = []
  for (const block of blocks) {
    if (block.kind !== 'unchanged' || expandedBlocks.has(block.blockId)) continue

    let startLine: number
    let lineCount: number
    if (side === 'center') {
      const placement = placements.get(block.blockId)
      if (!placement) continue
      startLine = placement.centerStartLine
      lineCount = placement.centerLineCount
    } else if (side === 'ours') {
      startLine = block.oursStartLine
      lineCount = block.oursLineCount
    } else {
      startLine = block.theirsStartLine
      lineCount = block.theirsLineCount
    }

    const region = collapsedRegionForRange(block.blockId, startLine, lineCount)
    if (region) regions.push(region)
  }
  return regions
}

/** `getTopForLineNumberSafe`-shaped hidden ranges for a pane's collapsed regions. */
export function toHiddenRanges(regions: CollapsedRegion[]): { start: number; end: number }[] {
  return regions.map((r) => ({ start: r.startHide, end: r.endHide }))
}

/** Banner view-zone geometry (the "N lines collapsed" strip) for a pane's collapsed regions. */
export function toBannerZones(regions: CollapsedRegion[]): { afterLineNumber: number; heightInLines: number }[] {
  return regions.map((r) => ({ afterLineNumber: r.startHide - 1, heightInLines: COLLAPSED_BANNER_HEIGHT_LINES }))
}

/** Highlights (or clears) every DOM copy of a collapsed block's banner at once — the same block
 * renders one banner per pane plus a connector wave, and hovering any of them should light up
 * all of them. Shared by the banner nodes' own listeners and `MergeConnectorOverlay`. */
export function setCollapsedBlockHover(blockId: number, active: boolean) {
  const elements = document.querySelectorAll(`[data-collapsed-block-id="${blockId}"]`)
  elements.forEach((el) => {
    if (active) {
      el.classList.add('is-hovered')
    } else {
      el.classList.remove('is-hovered')
    }
  })
}
