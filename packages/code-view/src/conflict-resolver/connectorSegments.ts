import type { MergeBlock } from '../types'
import type { ConnectorSegment } from '../MergeConnectorOverlay'
import {
  type BlockPlacement,
  type MergeSide,
  changeKindForBlock,
  connectorCenterRangeForSide,
  connectorClassForSide,
  isChangeSource,
} from '../mergeBlockLayout'
import { computePaneTotalLines, markerEdge } from '../mergeDecorations'
import { COLLAPSED_BANNER_HEIGHT_LINES } from '../mergeViewConfig'
import { type PaneSide, collapsedRegionForRange } from './collapsedRegions'

/** Everything the segment builders need to turn block/placement line numbers into pixel-space
 * connector geometry, abstracted away from the live Monaco editors so the builders stay pure
 * (and unit-testable with a line-number-times-line-height fake). */
export interface SegmentGeometry {
  /** A line's top Y offset in the pane's content space (the resolver's `getTop`). */
  getTop: (side: PaneSide, lineNumber: number) => number
  /** Bounding box of a pane's alignment view zone `data-zone-id="{blockId}-{side}"`, if the
   * zone is currently in the DOM — used to anchor a deletion's connector on the hatched filler
   * space instead of a zero-height boundary. */
  getZoneRect: (side: PaneSide, blockId: number) => { top: number; height: number } | null
  lineHeight: number
  collapseUnchanged: boolean
  expandedBlocks: Set<number>
}

/** The collapsed-banner connector for one unchanged block (or `null` when the block isn't
 * collapsed): a wave segment tying the two panes' "N lines collapsed" banners together. */
function collapsedSegment(
  geometry: SegmentGeometry,
  blockId: number,
  leftSide: PaneSide,
  leftStartLine: number,
  rightSide: PaneSide,
  rightStartLine: number,
  lineCount: number
): ConnectorSegment | null {
  const region = collapsedRegionForRange(blockId, leftStartLine, lineCount)
  if (!region) return null
  const bannerHeight = COLLAPSED_BANNER_HEIGHT_LINES * geometry.lineHeight

  // Both panes hide the same relative middle of the block; each banner sits right below the
  // last visible context line in its own pane's line space.
  const hideOffset = region.startHide - leftStartLine
  const leftY0 = geometry.getTop(leftSide, region.startHide - 1) + geometry.lineHeight
  const rightY0 = geometry.getTop(rightSide, rightStartLine + hideOffset - 1) + geometry.lineHeight

  return {
    id: blockId,
    leftY0,
    leftY1: leftY0 + bannerHeight,
    rightY0,
    rightY1: rightY0 + bannerHeight,
    colorClass: 'merge-connector-collapsed',
    actionable: false,
    flat: false,
    resolved: false,
    collapsedCount: region.collapsedCount,
  }
}

/** Segments for 2-panel (read-only diff) mode: one ribbon per change block between the original
 * (left/theirs) pane and the modified (right/center) pane, never actionable, plus collapsed
 * banners for long unchanged blocks. */
export function buildTwoWaySegments(
  blocks: MergeBlock[],
  placements: Map<number, BlockPlacement>,
  geometry: SegmentGeometry
): ConnectorSegment[] {
  const left: ConnectorSegment[] = []
  const paneTotals = computePaneTotalLines(blocks, placements)

  for (const block of blocks) {
    const placement = placements.get(block.blockId)
    if (!placement) continue

    if (block.kind === 'unchanged') {
      // Plain matching code never gets a change ribbon — only its collapsed-banner wave, and
      // only while it's actually collapsed (not manually expanded back open).
      if (geometry.collapseUnchanged && !geometry.expandedBlocks.has(block.blockId)) {
        const segment = collapsedSegment(
          geometry,
          block.blockId,
          'theirs',
          block.theirsStartLine,
          'center',
          placement.centerStartLine,
          block.theirsLineCount
        )
        if (segment) left.push(segment)
      }
      continue
    }

    const originalStartLine = block.theirsStartLine
    const originalCount = block.theirsLineCount
    const modifiedStartLine = placement.centerStartLine
    const modifiedCount = placement.centerLineCount

    let kind: 'addition' | 'deletion' | 'modification' = 'modification'
    if (originalCount === 0) kind = 'addition'
    else if (modifiedCount === 0) kind = 'deletion'

    const colorClass = `merge-connector-${kind}`

    let paneY0 = 0
    let paneY1 = 0
    if (originalCount === 0) {
      const afterLine = originalStartLine - 1
      const y = geometry.getTop('theirs', afterLine + 1)
      const edge = markerEdge(afterLine, paneTotals.theirs)
      if (edge === 'top') {
        paneY0 = y - 1
        paneY1 = y
      } else {
        paneY0 = y
        paneY1 = y + 1
      }
    } else {
      paneY0 = geometry.getTop('theirs', originalStartLine)
      paneY1 = geometry.getTop('theirs', originalStartLine + originalCount)
    }

    let centerY0 = 0
    let centerY1 = 0
    if (modifiedCount === 0) {
      const afterLine = modifiedStartLine - 1
      const y = geometry.getTop('center', afterLine + 1)
      const edge = markerEdge(afterLine, paneTotals.center)
      if (edge === 'top') {
        centerY0 = y - 1
        centerY1 = y
      } else {
        centerY0 = y
        centerY1 = y + 1
      }
    } else {
      centerY0 = geometry.getTop('center', modifiedStartLine)
      centerY1 = geometry.getTop('center', modifiedStartLine + modifiedCount)
    }

    left.push({
      id: block.blockId,
      leftY0: paneY0,
      leftY1: paneY1,
      rightY0: centerY0,
      rightY1: centerY1,
      colorClass,
      actionable: false,
      flat: originalCount === 0 && modifiedCount === 0,
      resolved: false,
    })
  }

  return left
}

/** Segments for 3-panel merge mode: per block, one segment per authored side — theirs-side
 * ribbons land in the LEFT gap (theirs ↔ center), ours-side ribbons in the RIGHT gap
 * (center ↔ ours) — plus collapsed banners in both gaps for long unchanged blocks. */
export function buildThreeWaySegments(
  blocks: MergeBlock[],
  placements: Map<number, BlockPlacement>,
  geometry: SegmentGeometry
): { left: ConnectorSegment[]; right: ConnectorSegment[] } {
  const left: ConnectorSegment[] = []
  const right: ConnectorSegment[] = []
  const paneTotals = computePaneTotalLines(blocks, placements)

  for (const block of blocks) {
    const placement = placements.get(block.blockId)
    if (!placement) continue

    if (
      block.kind === 'unchanged' &&
      geometry.collapseUnchanged &&
      !geometry.expandedBlocks.has(block.blockId)
    ) {
      const leftSegment = collapsedSegment(
        geometry,
        block.blockId,
        'theirs',
        block.theirsStartLine,
        'center',
        placement.centerStartLine,
        block.theirsLineCount
      )
      if (leftSegment) {
        left.push(leftSegment)
        const rightSegment = collapsedSegment(
          geometry,
          block.blockId,
          'center',
          placement.centerStartLine,
          'ours',
          block.oursStartLine,
          block.theirsLineCount
        )
        if (rightSegment) right.push(rightSegment)
      }
      continue
    }

    for (const side of ['ours', 'theirs'] as MergeSide[]) {
      const touched = side === 'ours' ? placement.oursTouched : placement.theirsTouched
      const colorClass = connectorClassForSide(block, touched, side)
      if (!colorClass) continue

      const paneStart = side === 'ours' ? block.oursStartLine : block.theirsStartLine
      const paneCount = side === 'ours' ? block.oursLineCount : block.theirsLineCount
      if (paneCount === 0 && changeKindForBlock(block) === 'addition') continue

      const { start, count } = connectorCenterRangeForSide(placement, block, side)

      let paneY0 = geometry.getTop(side, paneStart)
      let paneY1 = geometry.getTop(side, paneStart + paneCount)
      if (paneCount === 0) {
        const zoneRect = geometry.getZoneRect(side, block.blockId)
        if (zoneRect) {
          paneY0 = zoneRect.top
          paneY1 = zoneRect.top + zoneRect.height
        } else {
          paneY0 = paneY1
          if (changeKindForBlock(block) === 'deletion') {
            const edge = markerEdge(paneStart - 1, paneTotals[side])
            if (edge === 'top') {
              paneY0 = paneY1 - 1
            } else {
              paneY0 = paneY1
              paneY1 = paneY1 + 1
            }
          }
        }
      }

      let centerY0 = geometry.getTop('center', start)
      let centerY1 = geometry.getTop('center', start + count)
      if (count === 0 && changeKindForBlock(block) === 'addition') {
        const edge = markerEdge(start - 1, paneTotals.center)
        if (edge === 'top') {
          centerY0 = centerY1 - 1
        } else {
          centerY0 = centerY1
          centerY1 = centerY1 + 1
        }
      }

      const segment: ConnectorSegment = {
        id: block.blockId,
        // theirs (incoming) sits in the LEFT gap, ours (current) in the RIGHT gap — the
        // pane end of the segment is whichever edge touches that side's own pane.
        leftY0: side === 'theirs' ? paneY0 : centerY0,
        leftY1: side === 'theirs' ? paneY1 : centerY1,
        rightY0: side === 'theirs' ? centerY0 : paneY0,
        rightY1: side === 'theirs' ? centerY1 : paneY1,
        colorClass,
        // `isChangeSource` always returns the authoring side — for a deletion that's the
        // side that deleted (0 lines in its pane). The connector ribbon funnels from the
        // pane's zero-height boundary to the center's still-present base text, and the
        // action buttons anchor at that pane edge.
        actionable: !touched && isChangeSource(block, side),
        // Only truly flat (thin stroked line) when BOTH the pane and the center endpoint
        // are zero-height — e.g. a pending addition's mirror pane. A deletion where the
        // pane has 0 lines but the center still has base content draws as a filled funnel
        // ribbon from the point to the range, not a flat stroke.
        flat: paneCount === 0 && count === 0,
        resolved: touched,
      }
      if (side === 'theirs') left.push(segment)
      else right.push(segment)
    }
  }

  return { left, right }
}
