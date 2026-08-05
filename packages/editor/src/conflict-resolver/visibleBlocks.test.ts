import { describe, expect, it } from 'vitest'
import type { MergeBlock } from '../types'
import type { BlockPlacement } from '../mergeBlockLayout'
import { blocksInCenterRange } from './visibleBlocks'

function block(blockId: number, startLine: number, lineCount: number): MergeBlock {
  return {
    blockId,
    kind: 'both-different',
    oursStartLine: startLine,
    oursLineCount: lineCount,
    theirsStartLine: startLine,
    theirsLineCount: lineCount,
    oursLines: [],
    theirsLines: [],
  }
}

function placementsFor(blocks: MergeBlock[]): Map<number, BlockPlacement> {
  return new Map(
    blocks.map((b) => [
      b.blockId,
      {
        blockId: b.blockId,
        centerStartLine: b.oursStartLine,
        centerLineCount: b.oursLineCount,
        oursIncluded: false,
        theirsIncluded: false,
        oursTouched: false,
        theirsTouched: false,
      },
    ])
  )
}

/** 100 blocks of 5 lines each, one every 10 lines. */
const BLOCKS = Array.from({ length: 100 }, (_, i) => block(i, i * 10 + 1, 5))
const PLACEMENTS = placementsFor(BLOCKS)

describe('blocksInCenterRange', () => {
  it('returns everything when there is no range yet', () => {
    expect(blocksInCenterRange(BLOCKS, PLACEMENTS, null)).toBe(BLOCKS)
  })

  it('keeps only the blocks overlapping the range', () => {
    const kept = blocksInCenterRange(BLOCKS, PLACEMENTS, { start: 300, end: 340 }, 0)
    // Blocks span 1–5, 11–15, 21–25… Block 29 ends at 295 (before the range) and block 34 starts
    // at 341 (after it), so the range covers exactly 30 through 33.
    expect(kept.map((b) => b.blockId)).toEqual([30, 31, 32, 33])
  })

  it('bounds the result by the range, not by the size of the diff', () => {
    const kept = blocksInCenterRange(BLOCKS, PLACEMENTS, { start: 500, end: 540 })
    expect(kept.length).toBeLessThan(25)
    expect(BLOCKS.length).toBe(100)
  })

  it('includes a block straddling either edge of the range', () => {
    // Block 10 spans lines 101–105; a range starting at 104 still overlaps it.
    const atTop = blocksInCenterRange(BLOCKS, PLACEMENTS, { start: 104, end: 120 }, 0)
    expect(atTop.map((b) => b.blockId)).toContain(10)

    const atBottom = blocksInCenterRange(BLOCKS, PLACEMENTS, { start: 90, end: 101 }, 0)
    expect(atBottom.map((b) => b.blockId)).toContain(10)
  })

  it('widens the range by the overscan', () => {
    const tight = blocksInCenterRange(BLOCKS, PLACEMENTS, { start: 300, end: 340 }, 0)
    const overscanned = blocksInCenterRange(BLOCKS, PLACEMENTS, { start: 300, end: 340 }, 80)
    expect(overscanned.length).toBeGreaterThan(tight.length)
  })

  it('keeps a zero-line block, which still marks a boundary at its start line', () => {
    // A pending insertion or a deletion occupies no center lines but must still highlight.
    const empty = [block(0, 50, 0)]
    const kept = blocksInCenterRange(empty, placementsFor(empty), { start: 50, end: 60 }, 0)
    expect(kept).toHaveLength(1)
  })

  it('drops a block with no placement, matching what the compute functions do with it', () => {
    const kept = blocksInCenterRange(BLOCKS, new Map(), { start: 0, end: 1000 }, 0)
    expect(kept).toEqual([])
  })

  it('returns nothing when the range sits past every block', () => {
    expect(blocksInCenterRange(BLOCKS, PLACEMENTS, { start: 90_000, end: 90_100 })).toEqual([])
  })
})
