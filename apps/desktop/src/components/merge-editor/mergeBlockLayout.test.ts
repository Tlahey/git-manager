import { describe, expect, it } from 'vitest'
import type { MergeBlock } from '@git-manager/git-types'
import {
  changeKindForBlock,
  computeInitialPlacements,
  connectorCenterRangeForSide,
  connectorClassForSide,
  deriveLivePlacements,
  isChangeSource,
  linesForSide,
  placementOverridesAfterAutoMerge,
  recomputeAllPlacements,
  sideColorToken,
  subRangeForSide,
  updatePlacementAfterToggle,
  type BlockPlacement,
} from './mergeBlockLayout'

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

// A representative document: an unchanged header, a one-sided ours modification, a one-sided
// theirs addition, and a real two-sided conflict — covers every `MergeBlockKind`.
function sampleBlocks(): MergeBlock[] {
  return [
    block({
      blockId: 1,
      kind: 'unchanged',
      oursStartLine: 1,
      oursLineCount: 1,
      theirsStartLine: 1,
      theirsLineCount: 1,
      oursLines: ['header'],
      theirsLines: ['header'],
    }),
    block({
      blockId: 2,
      kind: 'ours-only',
      oursStartLine: 2,
      oursLineCount: 1,
      theirsStartLine: 2,
      theirsLineCount: 1,
      oursLines: ['ours modified'],
      theirsLines: ['original'],
    }),
    block({
      blockId: 3,
      kind: 'theirs-only',
      oursStartLine: 3,
      oursLineCount: 0,
      theirsStartLine: 3,
      theirsLineCount: 1,
      oursLines: [],
      theirsLines: ['theirs addition'],
    }),
    block({
      blockId: 4,
      kind: 'both-different',
      oursStartLine: 3,
      oursLineCount: 1,
      theirsStartLine: 4,
      theirsLineCount: 1,
      oursLines: ['ours conflict line'],
      theirsLines: ['theirs conflict line'],
    }),
  ]
}

describe('computeInitialPlacements / recomputeAllPlacements', () => {
  it('defaults every block to showing ours only, untouched', () => {
    const placements = computeInitialPlacements(sampleBlocks())
    for (const placement of placements.values()) {
      expect(placement.oursIncluded).toBe(true)
      expect(placement.theirsIncluded).toBe(false)
      expect(placement.oursTouched).toBe(false)
      expect(placement.theirsTouched).toBe(false)
    }
  })

  it('accumulates centerStartLine sequentially from each block’s default line count', () => {
    const placements = computeInitialPlacements(sampleBlocks())
    expect(placements.get(1)).toMatchObject({ centerStartLine: 1, centerLineCount: 1 }) // unchanged: 'header'
    expect(placements.get(2)).toMatchObject({ centerStartLine: 2, centerLineCount: 1 }) // ours-only: 'ours modified'
    expect(placements.get(3)).toMatchObject({ centerStartLine: 3, centerLineCount: 0 }) // theirs-only: ours side empty by default
    expect(placements.get(4)).toMatchObject({ centerStartLine: 3, centerLineCount: 1 }) // both-different: ours side shown
  })

  it('applies explicit overrides instead of the default flags', () => {
    const overrides = new Map([[3, { oursIncluded: false, theirsIncluded: true, oursTouched: true, theirsTouched: true }]])
    const placements = recomputeAllPlacements(sampleBlocks(), overrides)
    expect(placements.get(3)).toMatchObject({ centerLineCount: 1, oursIncluded: false, theirsIncluded: true })
  })
})

describe('subRangeForSide', () => {
  const blocks = sampleBlocks()
  const target = blocks[3] // both-different, blockId 4

  it('returns the ours sub-range when ours is included', () => {
    const placement: BlockPlacement = {
      blockId: 4,
      centerStartLine: 10,
      centerLineCount: 1,
      oursIncluded: true,
      theirsIncluded: false,
      oursTouched: false,
      theirsTouched: false,
    }
    expect(subRangeForSide(placement, target, 'ours')).toEqual({ start: 10, count: 1 })
  })

  it('pinches the ours sub-range to a zero-length point when ours is excluded', () => {
    const placement: BlockPlacement = {
      blockId: 4,
      centerStartLine: 10,
      centerLineCount: 1,
      oursIncluded: false,
      theirsIncluded: true,
      oursTouched: true,
      theirsTouched: true,
    }
    expect(subRangeForSide(placement, target, 'ours')).toEqual({ start: 10, count: 0 })
  })

  it('places the theirs sub-range right after the ours sub-range when both are included', () => {
    const placement: BlockPlacement = {
      blockId: 4,
      centerStartLine: 10,
      centerLineCount: 2,
      oursIncluded: true,
      theirsIncluded: true,
      oursTouched: true,
      theirsTouched: true,
    }
    expect(subRangeForSide(placement, target, 'ours')).toEqual({ start: 10, count: 1 })
    expect(subRangeForSide(placement, target, 'theirs')).toEqual({ start: 11, count: 1 })
  })

  it('pinches the theirs sub-range to the boundary right after ours when theirs is excluded', () => {
    const placement: BlockPlacement = {
      blockId: 4,
      centerStartLine: 10,
      centerLineCount: 1,
      oursIncluded: true,
      theirsIncluded: false,
      oursTouched: false,
      theirsTouched: false,
    }
    expect(subRangeForSide(placement, target, 'theirs')).toEqual({ start: 11, count: 0 })
  })
})

describe('connectorCenterRangeForSide', () => {
  const blocks = sampleBlocks()
  const target = blocks[3] // both-different, blockId 4

  it('matches subRangeForSide when the side is included (full height, its own content)', () => {
    const placement: BlockPlacement = {
      blockId: 4,
      centerStartLine: 10,
      centerLineCount: 1,
      oursIncluded: true,
      theirsIncluded: false,
      oursTouched: false,
      theirsTouched: false,
    }
    expect(connectorCenterRangeForSide(placement, target, 'ours')).toEqual({ start: 10, count: 1 })
  })

  it('spans the block’s whole occupied range — not a zero-height point — when the side is excluded but the other side is showing', () => {
    // Default, untouched conflict: ours is shown (1 line), theirs isn't yet. The theirs ribbon
    // must NOT pinch to a point here (that would make it look identical to a pure addition) —
    // it should span the same 1-line height ours currently occupies in the center.
    const placement: BlockPlacement = {
      blockId: 4,
      centerStartLine: 10,
      centerLineCount: 1,
      oursIncluded: true,
      theirsIncluded: false,
      oursTouched: false,
      theirsTouched: false,
    }
    expect(connectorCenterRangeForSide(placement, target, 'theirs')).toEqual({ start: 10, count: 1 })
  })

  it('only collapses to a genuine point when the block has nothing shown at all (a pending pure addition)', () => {
    const additionBlock = block({ blockId: 5, kind: 'theirs-only', oursLineCount: 0, theirsLineCount: 1, theirsLines: ['new'] })
    const placement: BlockPlacement = {
      blockId: 5,
      centerStartLine: 20,
      centerLineCount: 0,
      oursIncluded: true, // default, but contributes 0 lines since oursLineCount is 0
      theirsIncluded: false,
      oursTouched: false,
      theirsTouched: false,
    }
    expect(connectorCenterRangeForSide(placement, additionBlock, 'theirs')).toEqual({ start: 20, count: 0 })
  })
})

describe('linesForSide', () => {
  it('returns the side’s lines when included, and an empty array when excluded', () => {
    const b = block({ blockId: 1, kind: 'both-different', oursLines: ['a'], theirsLines: ['b'] })
    expect(linesForSide(b, 'ours', true)).toEqual(['a'])
    expect(linesForSide(b, 'ours', false)).toEqual([])
    expect(linesForSide(b, 'theirs', true)).toEqual(['b'])
  })
})

describe('updatePlacementAfterToggle', () => {
  it('accepting theirs on top of an already-included ours does not exclude ours (the "keep both" case)', () => {
    const blocks = sampleBlocks()
    const conflict = blocks[3] // blockId 4, oursLineCount 1, theirsLineCount 1
    const placements = computeInitialPlacements(blocks)

    const next = updatePlacementAfterToggle(placements, blocks, conflict, 'theirs', true)
    const updated = next.get(4)!

    expect(updated.oursIncluded).toBe(true) // untouched by this action
    expect(updated.theirsIncluded).toBe(true) // newly accepted
    expect(updated.theirsTouched).toBe(true)
    expect(updated.oursTouched).toBe(false) // ours was never itself decided
    expect(updated.centerLineCount).toBe(2) // both sides' lines now present
  })

  it('rejecting ours only removes ours, leaving a previously-accepted theirs intact', () => {
    const blocks = sampleBlocks()
    const conflict = blocks[3]
    let placements = computeInitialPlacements(blocks)
    placements = updatePlacementAfterToggle(placements, blocks, conflict, 'theirs', true) // keep both first
    placements = updatePlacementAfterToggle(placements, blocks, conflict, 'ours', false) // then reject ours

    const updated = placements.get(4)!
    expect(updated.oursIncluded).toBe(false)
    expect(updated.theirsIncluded).toBe(true) // unaffected by the ours-only action
    expect(updated.centerLineCount).toBe(1)
  })

  it('shifts every later block’s centerStartLine by the resulting delta, and no earlier block', () => {
    const blocks = sampleBlocks()
    const target = blocks[1] // blockId 2
    const placements = computeInitialPlacements(blocks)
    const before = { b1: placements.get(1)!.centerStartLine, b3: placements.get(3)!.centerStartLine, b4: placements.get(4)!.centerStartLine }

    // Accept theirs too on the ours-only modification block — grows the center by 1 line.
    const next = updatePlacementAfterToggle(placements, blocks, target, 'theirs', true)

    expect(next.get(1)!.centerStartLine).toBe(before.b1) // earlier block: untouched
    expect(next.get(3)!.centerStartLine).toBe(before.b3 + 1) // later blocks: shifted by the +1 delta
    expect(next.get(4)!.centerStartLine).toBe(before.b4 + 1)
  })

  it('is a no-op on line count when re-accepting a side that was already included', () => {
    const blocks = sampleBlocks()
    const target = blocks[3]
    const placements = computeInitialPlacements(blocks)
    const next = updatePlacementAfterToggle(placements, blocks, target, 'ours', true)
    expect(next.get(4)!.centerLineCount).toBe(placements.get(4)!.centerLineCount)
    expect(next.get(4)!.oursTouched).toBe(true) // still marks it as an explicit decision
  })
})

describe('deriveLivePlacements', () => {
  const blocks = sampleBlocks()

  function lineTextOf(text: string) {
    const lines = text.split('\n')
    return { getLineText: (n: number) => lines[n - 1] ?? '', totalLines: lines.length }
  }

  it('recognizes the untouched default buffer (ours only) as still pending for every block', () => {
    // Default center text: block1 ours, block2 ours, block3 (theirs-only) ours-side is empty, block4 ours.
    const text = ['header', 'ours modified', 'ours conflict line'].join('\n')
    const { getLineText, totalLines } = lineTextOf(text)
    const previous = computeInitialPlacements(blocks)

    const derived = deriveLivePlacements(getLineText, totalLines, blocks, previous)

    expect(derived.get(2)).toMatchObject({ oursIncluded: true, theirsIncluded: false, oursTouched: false })
    expect(derived.get(4)).toMatchObject({ oursIncluded: true, theirsIncluded: false, oursTouched: false })
  })

  it('recognizes ours immediately followed by theirs as "both included"', () => {
    const text = ['header', 'ours modified', 'ours conflict line', 'theirs conflict line'].join('\n')
    const { getLineText, totalLines } = lineTextOf(text)
    const previous = computeInitialPlacements(blocks)

    const derived = deriveLivePlacements(getLineText, totalLines, blocks, previous)

    const conflict = derived.get(4)!
    expect(conflict.oursIncluded).toBe(true)
    expect(conflict.theirsIncluded).toBe(true)
    expect(conflict.theirsTouched).toBe(true) // changed from the default (excluded)
    expect(conflict.centerLineCount).toBe(2)
  })

  it('recognizes theirs-only content as excluding ours (touched on both sides)', () => {
    const text = ['header', 'ours modified', 'theirs conflict line'].join('\n')
    const { getLineText, totalLines } = lineTextOf(text)
    const previous = computeInitialPlacements(blocks)

    const derived = deriveLivePlacements(getLineText, totalLines, blocks, previous)

    const conflict = derived.get(4)!
    expect(conflict.oursIncluded).toBe(false)
    expect(conflict.theirsIncluded).toBe(true)
    expect(conflict.oursTouched).toBe(true)
    expect(conflict.theirsTouched).toBe(true)
  })

  it('preserves "still untouched" when re-derived state matches the previous state exactly', () => {
    const text = ['header', 'ours modified', 'ours conflict line', 'theirs conflict line'].join('\n')
    const { getLineText, totalLines } = lineTextOf(text)

    // First pass marks theirs as touched (accepted).
    const previous = computeInitialPlacements(blocks)
    const firstPass = deriveLivePlacements(getLineText, totalLines, blocks, previous)
    // A second pass over the *same* text should not flip anything back to untouched.
    const secondPass = deriveLivePlacements(getLineText, totalLines, blocks, firstPass)

    expect(secondPass.get(4)!.theirsTouched).toBe(true)
  })

  it('falls back to a bounded forward scan for a free-form edit and attributes it to ours', () => {
    const text = ['header', 'a hand-typed replacement', 'ours conflict line'].join('\n')
    const { getLineText, totalLines } = lineTextOf(text)
    const previous = computeInitialPlacements(blocks)

    const derived = deriveLivePlacements(getLineText, totalLines, blocks, previous)

    expect(derived.get(2)).toMatchObject({ oursIncluded: true, theirsIncluded: false, centerLineCount: 1 })
  })

  it('treats a fully emptied block (both sides excluded) as zero consumed lines', () => {
    const text = ['header', 'ours conflict line'].join('\n') // block 2's line removed entirely
    const { getLineText, totalLines } = lineTextOf(text)
    const previous = computeInitialPlacements(blocks)

    const derived = deriveLivePlacements(getLineText, totalLines, blocks, previous)

    expect(derived.get(2)).toMatchObject({ centerLineCount: 0, oursIncluded: false, oursTouched: true })
  })
})

describe('placementOverridesAfterAutoMerge', () => {
  it('settles ours-only blocks onto ours, fully touched', () => {
    const blocks = sampleBlocks()
    const placements = computeInitialPlacements(blocks)
    const overrides = placementOverridesAfterAutoMerge(blocks, placements)
    expect(overrides.get(2)).toEqual({ oursIncluded: true, theirsIncluded: false, oursTouched: true, theirsTouched: true })
  })

  it('settles theirs-only blocks onto theirs, fully touched', () => {
    const blocks = sampleBlocks()
    const placements = computeInitialPlacements(blocks)
    const overrides = placementOverridesAfterAutoMerge(blocks, placements)
    expect(overrides.get(3)).toEqual({ oursIncluded: false, theirsIncluded: true, oursTouched: true, theirsTouched: true })
  })

  it('leaves a genuine two-sided conflict fully untouched', () => {
    const blocks = sampleBlocks()
    const placements = computeInitialPlacements(blocks)
    const overrides = placementOverridesAfterAutoMerge(blocks, placements)
    expect(overrides.get(4)).toEqual({ oursIncluded: true, theirsIncluded: false, oursTouched: false, theirsTouched: false })
  })

  it('leaves a block the user already decided exactly as they left it, even if non-conflicting', () => {
    const blocks = sampleBlocks()
    let placements = computeInitialPlacements(blocks)
    // Manually keep both sides on the ours-only modification block before running the wand.
    placements = updatePlacementAfterToggle(placements, blocks, blocks[1], 'theirs', true)

    const overrides = placementOverridesAfterAutoMerge(blocks, placements)

    expect(overrides.get(2)).toEqual({ oursIncluded: true, theirsIncluded: true, oursTouched: false, theirsTouched: true })
  })
})

describe('changeKindForBlock', () => {
  it('classifies a both-different block as a conflict', () => {
    expect(changeKindForBlock(block({ blockId: 1, kind: 'both-different' }))).toBe('conflict')
  })

  it('classifies ours-only with no theirs content as a pure addition', () => {
    expect(changeKindForBlock(block({ blockId: 1, kind: 'ours-only', oursLineCount: 1, theirsLineCount: 0 }))).toBe('addition')
  })

  it('classifies ours-only with no ours content as a pure deletion', () => {
    expect(changeKindForBlock(block({ blockId: 1, kind: 'ours-only', oursLineCount: 0, theirsLineCount: 1 }))).toBe('deletion')
  })

  it('classifies ours-only with content on both sides as a modification', () => {
    expect(changeKindForBlock(block({ blockId: 1, kind: 'ours-only', oursLineCount: 1, theirsLineCount: 1 }))).toBe('modification')
  })

  it('mirrors the same rules for theirs-only', () => {
    expect(changeKindForBlock(block({ blockId: 1, kind: 'theirs-only', oursLineCount: 0, theirsLineCount: 1 }))).toBe('addition')
    expect(changeKindForBlock(block({ blockId: 1, kind: 'theirs-only', oursLineCount: 1, theirsLineCount: 0 }))).toBe('deletion')
    expect(changeKindForBlock(block({ blockId: 1, kind: 'theirs-only', oursLineCount: 1, theirsLineCount: 1 }))).toBe('modification')
  })
})

describe('isChangeSource', () => {
  it('is actionable from both sides for a genuine conflict', () => {
    const conflict = block({ blockId: 1, kind: 'both-different', oursLineCount: 1, theirsLineCount: 1 })
    expect(isChangeSource(conflict, 'ours')).toBe(true)
    expect(isChangeSource(conflict, 'theirs')).toBe(true)
  })

  it('is never actionable for an auto-merged (unchanged/both-same) block', () => {
    expect(isChangeSource(block({ blockId: 1, kind: 'unchanged' }), 'ours')).toBe(false)
    expect(isChangeSource(block({ blockId: 1, kind: 'unchanged' }), 'theirs')).toBe(false)
  })

  it('for a pure ADDITION, matches the authoring side (the side with the new content)', () => {
    const oursAddition = block({ blockId: 1, kind: 'ours-only', oursLineCount: 2, theirsLineCount: 0 })
    expect(isChangeSource(oursAddition, 'ours')).toBe(true)
    expect(isChangeSource(oursAddition, 'theirs')).toBe(false)

    const theirsAddition = block({ blockId: 2, kind: 'theirs-only', oursLineCount: 0, theirsLineCount: 2 })
    expect(isChangeSource(theirsAddition, 'theirs')).toBe(true)
    expect(isChangeSource(theirsAddition, 'ours')).toBe(false)
  })

  it('for a one-sided MODIFICATION, matches the authoring side (both sides have content, only one actually changed the value)', () => {
    const oursModification = block({ blockId: 1, kind: 'ours-only', oursLineCount: 1, theirsLineCount: 1 })
    expect(isChangeSource(oursModification, 'ours')).toBe(true)
    expect(isChangeSource(oursModification, 'theirs')).toBe(false)
  })

  it('for a pure DELETION, flips to the side that still HAS the content — not the side that deleted it', () => {
    // ours-only deletion: base had it, ours removed it (oursLineCount 0), theirs still has it.
    // The deleting side (ours) now shows nothing to anchor a button near; the action belongs
    // on theirs' gap, where the actual ribbon/content is visible.
    const oursDeletion = block({ blockId: 1, kind: 'ours-only', oursLineCount: 0, theirsLineCount: 2 })
    expect(isChangeSource(oursDeletion, 'theirs')).toBe(true)
    expect(isChangeSource(oursDeletion, 'ours')).toBe(false)

    // Mirrored: theirs-only deletion — theirs removed it, ours still has it.
    const theirsDeletion = block({ blockId: 2, kind: 'theirs-only', oursLineCount: 2, theirsLineCount: 0 })
    expect(isChangeSource(theirsDeletion, 'ours')).toBe(true)
    expect(isChangeSource(theirsDeletion, 'theirs')).toBe(false)
  })
})

describe('sideColorToken / connectorClassForSide', () => {
  it('never colors an auto-merged block, touched or not', () => {
    const unchanged = block({ blockId: 1, kind: 'unchanged' })
    expect(sideColorToken(unchanged, false)).toBeUndefined()
    expect(sideColorToken(unchanged, true)).toBeUndefined()
  })

  it('tokens a pure addition green', () => {
    const addition = block({ blockId: 1, kind: 'ours-only', oursLineCount: 1, theirsLineCount: 0 })
    expect(sideColorToken(addition, false)).toBe('addition')
  })

  it('tokens a pure deletion gray — same weight as already-settled', () => {
    const deletion = block({ blockId: 1, kind: 'ours-only', oursLineCount: 0, theirsLineCount: 1 })
    expect(sideColorToken(deletion, false)).toBe('deletion')
  })

  it('tokens a one-sided modification blue while untouched', () => {
    const modification = block({ blockId: 1, kind: 'ours-only', oursLineCount: 1, theirsLineCount: 1 })
    expect(sideColorToken(modification, false)).toBe('modification')
  })

  it('tokens a genuine two-sided conflict red while untouched', () => {
    const conflict = block({ blockId: 1, kind: 'both-different', oursLineCount: 1, theirsLineCount: 1 })
    expect(sideColorToken(conflict, false)).toBe('conflict')
  })

  it('turns gray once a side is touched, regardless of change kind', () => {
    const addition = block({ blockId: 1, kind: 'ours-only', oursLineCount: 1, theirsLineCount: 0 })
    expect(sideColorToken(addition, true)).toBe('resolved')
  })

  it('mirrors the block color as a connector class with the merge-connector- prefix', () => {
    const conflict = block({ blockId: 1, kind: 'both-different', oursLineCount: 1, theirsLineCount: 1 })
    expect(connectorClassForSide(conflict, false, 'ours')).toBe('merge-connector-conflict')
    expect(connectorClassForSide(conflict, true, 'ours')).toBe('merge-connector-resolved')

    const unchanged = block({ blockId: 2, kind: 'unchanged' })
    expect(connectorClassForSide(unchanged, false, 'ours')).toBeUndefined()
  })
})
