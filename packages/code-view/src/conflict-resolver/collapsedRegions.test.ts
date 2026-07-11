import { describe, expect, it } from 'vitest'
import type { MergeBlock } from '../types'
import { computeInitialPlacements } from '../mergeBlockLayout'
import { COLLAPSE_CONTEXT_LINES } from '../mergeViewConfig'
import {
  collapsedRegionForRange,
  collapsedRegionsForPane,
  setCollapsedBlockHover,
  toBannerZones,
  toHiddenRanges,
} from './collapsedRegions'

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

describe('collapsedRegionForRange', () => {
  it('hides the middle of a long range, keeping 3 context lines on each side', () => {
    // 10 lines starting at line 1: keep 1-3 and 8-10, hide 4-7.
    expect(collapsedRegionForRange(1, 1, 10)).toEqual({ blockId: 1, startHide: 4, endHide: 7, collapsedCount: 4 })
  })

  it('returns null for ranges too short to have a hideable middle (<= 2 * context lines)', () => {
    expect(collapsedRegionForRange(1, 1, 2 * COLLAPSE_CONTEXT_LINES)).toBeNull()
    expect(collapsedRegionForRange(1, 5, 0)).toBeNull()
  })

  it('collapses exactly one line when the range is one past the threshold', () => {
    expect(collapsedRegionForRange(2, 10, 7)).toEqual({ blockId: 2, startHide: 13, endHide: 13, collapsedCount: 1 })
  })

  it('offsets the hidden range by the range start line', () => {
    expect(collapsedRegionForRange(3, 21, 10)).toEqual({ blockId: 3, startHide: 24, endHide: 27, collapsedCount: 4 })
  })
})

describe('collapsedRegionsForPane', () => {
  const blocks: MergeBlock[] = [
    unchangedBlock(1, 1, 10),
    block({
      blockId: 2,
      kind: 'both-different',
      oursStartLine: 11,
      oursLineCount: 20,
      theirsStartLine: 11,
      theirsLineCount: 20,
      oursLines: Array.from({ length: 20 }, (_, i) => `ours ${i}`),
      theirsLines: Array.from({ length: 20 }, (_, i) => `theirs ${i}`),
    }),
    unchangedBlock(3, 31, 4),
  ]
  const placements = computeInitialPlacements(blocks)

  it('collapses only long-enough unchanged blocks — never changed or short blocks', () => {
    const regions = collapsedRegionsForPane(blocks, placements, new Set(), 'theirs')
    expect(regions).toEqual([{ blockId: 1, startHide: 4, endHide: 7, collapsedCount: 4 }])
  })

  it('skips blocks the user manually expanded', () => {
    expect(collapsedRegionsForPane(blocks, placements, new Set([1]), 'theirs')).toEqual([])
  })

  it('uses the live placement geometry for the center pane', () => {
    const shifted = new Map(placements)
    const p = shifted.get(1)!
    shifted.set(1, { ...p, centerStartLine: 6 })
    const regions = collapsedRegionsForPane(blocks, shifted, new Set(), 'center')
    expect(regions).toEqual([{ blockId: 1, startHide: 9, endHide: 12, collapsedCount: 4 }])
  })

  it('skips center-pane blocks with no placement', () => {
    expect(collapsedRegionsForPane(blocks, new Map(), new Set(), 'center')).toEqual([])
  })

  it('uses each side pane’s own fixed block range', () => {
    const asymmetric = [
      block({
        blockId: 1,
        kind: 'unchanged',
        oursStartLine: 5,
        oursLineCount: 10,
        theirsStartLine: 1,
        theirsLineCount: 4,
        oursLines: Array.from({ length: 10 }, (_, i) => `l${i}`),
        theirsLines: Array.from({ length: 4 }, (_, i) => `l${i}`),
      }),
    ]
    expect(collapsedRegionsForPane(asymmetric, computeInitialPlacements(asymmetric), new Set(), 'ours')).toEqual([
      { blockId: 1, startHide: 8, endHide: 11, collapsedCount: 4 },
    ])
    expect(collapsedRegionsForPane(asymmetric, computeInitialPlacements(asymmetric), new Set(), 'theirs')).toEqual([])
  })
})

describe('toHiddenRanges / toBannerZones', () => {
  const regions = [
    { blockId: 1, startHide: 4, endHide: 7, collapsedCount: 4 },
    { blockId: 2, startHide: 24, endHide: 27, collapsedCount: 4 },
  ]

  it('maps regions to getTopForLineNumberSafe-shaped hidden ranges', () => {
    expect(toHiddenRanges(regions)).toEqual([
      { start: 4, end: 7 },
      { start: 24, end: 27 },
    ])
  })

  it('anchors each banner zone right above its hidden range, 1.5 lines tall', () => {
    expect(toBannerZones(regions)).toEqual([
      { afterLineNumber: 3, heightInLines: 1.5 },
      { afterLineNumber: 23, heightInLines: 1.5 },
    ])
  })
})

describe('setCollapsedBlockHover', () => {
  it('toggles is-hovered on every DOM copy of the block’s banner and nothing else', () => {
    const a = document.createElement('div')
    a.setAttribute('data-collapsed-block-id', '7')
    const b = document.createElement('div')
    b.setAttribute('data-collapsed-block-id', '7')
    const other = document.createElement('div')
    other.setAttribute('data-collapsed-block-id', '8')
    document.body.append(a, b, other)

    setCollapsedBlockHover(7, true)
    expect(a.classList.contains('is-hovered')).toBe(true)
    expect(b.classList.contains('is-hovered')).toBe(true)
    expect(other.classList.contains('is-hovered')).toBe(false)

    setCollapsedBlockHover(7, false)
    expect(a.classList.contains('is-hovered')).toBe(false)
    expect(b.classList.contains('is-hovered')).toBe(false)

    a.remove()
    b.remove()
    other.remove()
  })
})
