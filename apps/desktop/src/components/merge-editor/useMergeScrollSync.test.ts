import { describe, expect, it } from 'vitest'
import type { MergeBlock } from '@git-manager/git-types'
import { getAlignedCoordinatesForPaneLine } from './useMergeScrollSync'
import { computeInitialPlacements, updatePlacementAfterToggle, type BlockPlacement } from './mergeBlockLayout'

function createBlock(overrides: Partial<MergeBlock> & Pick<MergeBlock, 'blockId' | 'kind'>): MergeBlock {
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

describe('getAlignedCoordinatesForPaneLine', () => {
  it('maps unchanged lines 1-to-1 without freezing', () => {
    const blocks = [
      createBlock({
        blockId: 1,
        kind: 'unchanged',
        oursStartLine: 1,
        oursLineCount: 5,
        theirsStartLine: 1,
        theirsLineCount: 5,
      }),
    ]
    const placements = computeInitialPlacements(blocks)

    // Scroll Center at physical line 3
    const coords = getAlignedCoordinatesForPaneLine(3, 1, blocks, placements)
    expect(coords).toEqual({
      theirsLine: 3,
      theirsFrozen: false,
      centerLine: 3,
      centerFrozen: false,
      oursLine: 3,
      oursFrozen: false,
    })
  })

  it('handles a conflict block where both sides are included in Center', () => {
    const blocks = [
      createBlock({
        blockId: 1,
        kind: 'both-different',
        oursStartLine: 1,
        oursLineCount: 2, // Ours: lines 1, 2
        theirsStartLine: 1,
        theirsLineCount: 3, // Theirs: lines 1, 2, 3
      }),
    ]
    // Force both to be included in Center
    let placements = computeInitialPlacements(blocks)
    placements = updatePlacementAfterToggle(placements, blocks, blocks[0], 'ours', true)
    placements = updatePlacementAfterToggle(placements, blocks, blocks[0], 'theirs', true)

    // Center has Ours first (2 lines), then Theirs (3 lines). Total = 5 lines.
    // Center lines 1-2: Ours.
    // Center lines 3-5: Theirs.

    // Center line 1: inside Ours part of the block
    let coords = getAlignedCoordinatesForPaneLine(1, 1, blocks, placements)
    expect(coords).toEqual({
      theirsLine: 1,
      theirsFrozen: true, // Theirs hasn't started yet in Center sequence
      centerLine: 1,
      centerFrozen: false,
      oursLine: 1,
      oursFrozen: false,
    })

    // Center line 3: inside Theirs part of the block
    coords = getAlignedCoordinatesForPaneLine(3, 1, blocks, placements)
    expect(coords).toEqual({
      theirsLine: 1,
      theirsFrozen: false,
      centerLine: 3,
      centerFrozen: false,
      oursLine: 3, // Ours is frozen at the end of its lines (start + count)
      oursFrozen: true,
    })
  })

  it('handles single side inclusion correctly (freezes excluded side)', () => {
    const blocks = [
      createBlock({
        blockId: 1,
        kind: 'both-different',
        oursStartLine: 1,
        oursLineCount: 2,
        theirsStartLine: 1,
        theirsLineCount: 3,
      }),
    ]
    // Only Ours included in Center
    const placements = computeInitialPlacements(blocks)

    // Center has 2 lines (Ours). Theirs is not included.
    const coords = getAlignedCoordinatesForPaneLine(2, 1, blocks, placements)
    expect(coords).toEqual({
      theirsLine: 1, // Excluded Theirs stays frozen at start
      theirsFrozen: true,
      centerLine: 2,
      centerFrozen: false,
      oursLine: 2,
      oursFrozen: false,
    })
  })

  it('handles fallback correctly past the end of the document', () => {
    const blocks = [
      createBlock({
        blockId: 1,
        kind: 'unchanged',
        oursStartLine: 1,
        oursLineCount: 2,
        theirsStartLine: 1,
        theirsLineCount: 2,
      }),
    ]
    const placements = computeInitialPlacements(blocks)

    const coords = getAlignedCoordinatesForPaneLine(5, 1, blocks, placements)
    expect(coords).toEqual({
      theirsLine: 5,
      theirsFrozen: false,
      centerLine: 5,
      centerFrozen: false,
      oursLine: 5,
      oursFrozen: false,
    })
  })
})
