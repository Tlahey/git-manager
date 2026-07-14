import { describe, expect, it } from 'vitest'
import type { MergeBlock } from '../types'
import type { BlockPlacement } from '../mergeBlockLayout'
import {
  computeInitialPlacements,
  connectorCenterRangeForSide,
  updatePlacementAfterToggle,
} from '../mergeBlockLayout'
import {
  type SegmentGeometry,
  buildThreeWaySegments,
  buildTwoWaySegments,
} from './connectorSegments'

const LINE_HEIGHT = 10

/** Line-number-proportional fake geometry: line N's top sits at (N-1) * LINE_HEIGHT in every
 * pane, no view zones, no zone rects unless a test overrides getZoneRect. */
function fakeGeometry(overrides: Partial<SegmentGeometry> = {}): SegmentGeometry {
  return {
    getTop: (_side, lineNumber) => (lineNumber - 1) * LINE_HEIGHT,
    getZoneRect: () => null,
    lineHeight: LINE_HEIGHT,
    collapseUnchanged: false,
    expandedBlocks: new Set(),
    ...overrides,
  }
}

function block(overrides: Partial<MergeBlock> & Pick<MergeBlock, 'blockId' | 'kind'>): MergeBlock {
  return {
    oursStartLine: 1,
    oursLineCount: 0,
    theirsStartLine: 1,
    theirsLineCount: 0,
    oursLines: [],
    theirsLines: [],
    ...overrides,
  }
}

function unchangedBlock(blockId: number, startLine: number, lineCount: number): MergeBlock {
  const lines = Array.from({ length: lineCount }, (_, i) => `line ${startLine + i}`)
  return block({
    blockId,
    kind: 'unchanged',
    oursStartLine: startLine,
    oursLineCount: lineCount,
    theirsStartLine: startLine,
    theirsLineCount: lineCount,
    oursLines: lines,
    theirsLines: lines,
  })
}

/** 2-way placements mirror the block's ours* (modified-pane) geometry, like the resolver's
 * dynamic-view seeding does. */
function twoWayPlacements(blocks: MergeBlock[]): Map<number, BlockPlacement> {
  const placements = new Map<number, BlockPlacement>()
  for (const b of blocks) {
    placements.set(b.blockId, {
      blockId: b.blockId,
      centerStartLine: b.oursStartLine,
      centerLineCount: b.oursLineCount,
      oursIncluded: false,
      theirsIncluded: false,
      oursTouched: false,
      theirsTouched: false,
    })
  }
  return placements
}

describe('buildTwoWaySegments', () => {
  it('produces one never-actionable ribbon per change block, spanning both panes’ line ranges', () => {
    // 2-way blocks always come from buildDynamicMergeView, which only emits change blocks —
    // unchanged regions never appear as blocks in this mode.
    const blocks = [
      block({
        blockId: 1,
        kind: 'theirs-only',
        theirsStartLine: 2,
        theirsLineCount: 2,
        oursStartLine: 2,
        oursLineCount: 1,
        theirsLines: ['old a', 'old b'],
      }),
    ]
    const segments = buildTwoWaySegments(blocks, twoWayPlacements(blocks), fakeGeometry())

    expect(segments).toHaveLength(1)
    expect(segments[0]).toMatchObject({
      id: 1,
      leftY0: 10, // line 2 top
      leftY1: 30, // line 4 top (exclusive end of the 2-line range)
      rightY0: 10,
      rightY1: 20,
      colorClass: 'merge-connector-modification',
      actionable: false,
      flat: false,
      resolved: false,
    })
  })

  it('renders a pure insertion’s original-pane end as a 1px marker edge', () => {
    const blocks = [
      block({
        blockId: 1,
        kind: 'theirs-only',
        theirsStartLine: 2,
        theirsLineCount: 0,
        oursStartLine: 2,
        oursLineCount: 1,
      }),
    ]
    const [segment] = buildTwoWaySegments(blocks, twoWayPlacements(blocks), fakeGeometry())

    expect(segment.colorClass).toBe('merge-connector-addition')
    expect(Math.abs(segment.leftY1 - segment.leftY0)).toBe(1)
    expect(segment.rightY1 - segment.rightY0).toBe(LINE_HEIGHT)
    expect(segment.flat).toBe(false)
  })

  it('draws a collapsed wave segment for a long unchanged block when collapse is on', () => {
    const blocks = [unchangedBlock(1, 1, 10)]
    const segments = buildTwoWaySegments(
      blocks,
      twoWayPlacements(blocks),
      fakeGeometry({ collapseUnchanged: true })
    )

    expect(segments).toHaveLength(1)
    expect(segments[0]).toMatchObject({
      id: 1,
      colorClass: 'merge-connector-collapsed',
      collapsedCount: 4,
      actionable: false,
      // Banner sits below hidden-range start (line 4)'s previous line top + one line height…
      leftY0: (3 - 1) * LINE_HEIGHT + LINE_HEIGHT,
      // …and is 1.5 lines tall.
      leftY1: (3 - 1) * LINE_HEIGHT + LINE_HEIGHT + 1.5 * LINE_HEIGHT,
    })
  })

  it('draws no collapsed wave for a collapsed-eligible block that the user expanded', () => {
    const blocks = [unchangedBlock(1, 1, 10)]
    const segments = buildTwoWaySegments(
      blocks,
      twoWayPlacements(blocks),
      fakeGeometry({ collapseUnchanged: true, expandedBlocks: new Set([1]) })
    )
    expect(segments.some((s) => s.colorClass === 'merge-connector-collapsed')).toBe(false)
  })
})

describe('buildThreeWaySegments', () => {
  const conflictBlocks = [
    unchangedBlock(1, 1, 1),
    block({
      blockId: 2,
      kind: 'both-different',
      oursStartLine: 2,
      oursLineCount: 1,
      theirsStartLine: 2,
      theirsLineCount: 1,
      oursLines: ['ours conflict'],
      theirsLines: ['theirs conflict'],
    }),
  ]

  it('emits an actionable conflict ribbon in each gap for an untouched both-different block', () => {
    const placements = computeInitialPlacements(conflictBlocks)
    const { left, right } = buildThreeWaySegments(conflictBlocks, placements, fakeGeometry())

    expect(left).toHaveLength(1)
    expect(right).toHaveLength(1)
    expect(left[0]).toMatchObject({
      id: 2,
      colorClass: 'merge-connector-conflict',
      actionable: true,
      resolved: false,
    })
    expect(right[0]).toMatchObject({
      id: 2,
      colorClass: 'merge-connector-conflict',
      actionable: true,
      resolved: false,
    })

    // The pane end of each segment touches its own pane: theirs on the left gap's left edge,
    // ours on the right gap's right edge.
    expect(left[0].leftY0).toBe(10)
    expect(left[0].leftY1).toBe(20)
    expect(right[0].rightY0).toBe(10)
    expect(right[0].rightY1).toBe(20)

    // Center ends mirror connectorCenterRangeForSide for each side.
    const placement = placements.get(2)!
    const theirsRange = connectorCenterRangeForSide(placement, conflictBlocks[1], 'theirs')
    expect(left[0].rightY0).toBe((theirsRange.start - 1) * LINE_HEIGHT)
    const oursRange = connectorCenterRangeForSide(placement, conflictBlocks[1], 'ours')
    expect(right[0].leftY0).toBe((oursRange.start - 1) * LINE_HEIGHT)
  })

  it('marks a decided side resolved and no longer actionable, leaving the other side actionable', () => {
    let placements = computeInitialPlacements(conflictBlocks)
    placements = updatePlacementAfterToggle(
      placements,
      conflictBlocks,
      conflictBlocks[1],
      'theirs',
      true
    )

    const { left, right } = buildThreeWaySegments(conflictBlocks, placements, fakeGeometry())
    expect(left[0]).toMatchObject({ resolved: true, actionable: false })
    expect(right[0]).toMatchObject({ resolved: false, actionable: true })
  })

  it('emits a ribbon only in the authoring side’s gap for a one-sided change', () => {
    const blocks = [
      block({
        blockId: 1,
        kind: 'ours-only',
        oursStartLine: 1,
        oursLineCount: 1,
        theirsStartLine: 1,
        theirsLineCount: 1,
        oursLines: ['ours modified'],
        theirsLines: ['original'],
      }),
    ]
    const { left, right } = buildThreeWaySegments(
      blocks,
      computeInitialPlacements(blocks),
      fakeGeometry()
    )

    expect(left).toEqual([])
    expect(right).toHaveLength(1)
    expect(right[0]).toMatchObject({
      id: 1,
      colorClass: 'merge-connector-modification',
      actionable: true,
    })
  })

  it('anchors a deletion’s empty pane end on the hatched filler zone when one is in the DOM', () => {
    const blocks = [
      block({
        blockId: 1,
        kind: 'ours-only',
        oursStartLine: 1,
        oursLineCount: 0,
        theirsStartLine: 1,
        theirsLineCount: 1,
        oursLines: [],
        theirsLines: ['deleted line'],
      }),
    ]
    const { right } = buildThreeWaySegments(
      blocks,
      computeInitialPlacements(blocks),
      fakeGeometry({
        getZoneRect: (side, blockId) =>
          side === 'ours' && blockId === 1 ? { top: 100, height: 20 } : null,
      })
    )

    expect(right).toHaveLength(1)
    // ours sits on the RIGHT edge of the right gap.
    expect(right[0].rightY0).toBe(100)
    expect(right[0].rightY1).toBe(120)
  })

  it('emits collapsed wave segments in both gaps for a long unchanged block', () => {
    const blocks = [unchangedBlock(1, 1, 10)]
    const { left, right } = buildThreeWaySegments(
      blocks,
      computeInitialPlacements(blocks),
      fakeGeometry({ collapseUnchanged: true })
    )

    expect(left).toHaveLength(1)
    expect(right).toHaveLength(1)
    expect(left[0]).toMatchObject({ colorClass: 'merge-connector-collapsed', collapsedCount: 4 })
    expect(right[0]).toMatchObject({ colorClass: 'merge-connector-collapsed', collapsedCount: 4 })
  })
})
