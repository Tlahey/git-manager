import { describe, expect, it } from 'vitest'
import type { editor } from 'monaco-editor'
import type { MergeBlock } from '../types'
import type { BlockPlacement } from '../mergeBlockLayout'
import { buildDynamicMergeView, computeTwoWayVisuals } from './twoWayView'

function lineChange(
  originalStart: number,
  originalEnd: number,
  modifiedStart: number,
  modifiedEnd: number
): editor.ILineChange {
  return {
    originalStartLineNumber: originalStart,
    originalEndLineNumber: originalEnd,
    modifiedStartLineNumber: modifiedStart,
    modifiedEndLineNumber: modifiedEnd,
    charChanges: undefined,
  }
}

describe('buildDynamicMergeView', () => {
  it('maps a modification to a theirs-only block carrying the modified geometry in the ours fields', () => {
    const view = buildDynamicMergeView('line1\noriginal\nline3', [lineChange(2, 2, 2, 2)])

    expect(view.theirsText).toBe('line1\noriginal\nline3')
    expect(view.oursText).toBe('')
    expect(view.blocks).toHaveLength(1)
    expect(view.blocks[0]).toEqual({
      blockId: 0,
      kind: 'theirs-only',
      oursStartLine: 2,
      oursLineCount: 1,
      theirsStartLine: 2,
      theirsLineCount: 1,
      oursLines: [],
      theirsLines: ['original'],
      baseLines: ['original'],
    })
  })

  it('maps a pure insertion (originalEnd 0) to a zero-count original range with no theirs lines', () => {
    const view = buildDynamicMergeView('line1\nline2', [lineChange(1, 0, 2, 2)])

    expect(view.blocks[0]).toMatchObject({
      theirsStartLine: 1,
      theirsLineCount: 0,
      oursStartLine: 2,
      oursLineCount: 1,
      theirsLines: [],
    })
  })

  it('maps a pure deletion (modifiedEnd 0) to a zero-count modified range keeping the deleted lines', () => {
    const view = buildDynamicMergeView('line1\nold1\nold2\nline4', [lineChange(2, 3, 1, 0)])

    expect(view.blocks[0]).toMatchObject({
      theirsStartLine: 2,
      theirsLineCount: 2,
      oursStartLine: 1,
      oursLineCount: 0,
      theirsLines: ['old1', 'old2'],
      baseLines: ['old1', 'old2'],
    })
  })

  it('assigns sequential block ids to multiple changes', () => {
    const view = buildDynamicMergeView('a\nb\nc\nd', [
      lineChange(1, 1, 1, 1),
      lineChange(3, 3, 3, 3),
    ])
    expect(view.blocks.map((b) => b.blockId)).toEqual([0, 1])
  })
})

describe('computeTwoWayVisuals', () => {
  function makeBlock(overrides: Partial<MergeBlock>): MergeBlock {
    return {
      blockId: 0,
      kind: 'theirs-only',
      oursStartLine: 1,
      oursLineCount: 0,
      theirsStartLine: 1,
      theirsLineCount: 0,
      oursLines: [],
      theirsLines: [],
      ...overrides,
    }
  }

  function placementFor(block: MergeBlock): Map<number, BlockPlacement> {
    // 2-way placements mirror the block's `ours*` (modified-pane) geometry — same seeding the
    // resolver does when the dynamic view lands.
    return new Map([
      [
        block.blockId,
        {
          blockId: block.blockId,
          centerStartLine: block.oursStartLine,
          centerLineCount: block.oursLineCount,
          oursIncluded: false,
          theirsIncluded: false,
          oursTouched: false,
          theirsTouched: false,
        },
      ],
    ])
  }

  it('decorates a modification on both panes and leaves the (unused) ours slot empty', () => {
    const block = makeBlock({
      theirsStartLine: 2,
      theirsLineCount: 1,
      oursStartLine: 2,
      oursLineCount: 1,
      theirsLines: ['x'],
    })
    const visuals = computeTwoWayVisuals([block], placementFor(block), false)

    expect(visuals.theirs.decorations.some((d) => d.className.includes('modification'))).toBe(true)
    expect(visuals.center.decorations.some((d) => d.className.includes('modification'))).toBe(true)
    expect(visuals.ours.decorations).toEqual([])
    expect(visuals.ours.viewZones).toEqual([])
  })

  it('renders a pure addition as a boundary marker on the original pane', () => {
    const block = makeBlock({
      theirsStartLine: 2,
      theirsLineCount: 0,
      oursStartLine: 2,
      oursLineCount: 1,
    })
    const visuals = computeTwoWayVisuals([block], placementFor(block), false)

    expect(visuals.theirs.decorations).toHaveLength(1)
    expect(visuals.theirs.decorations[0].className).toMatch(/^merge-marker-(top|bottom)-addition$/)
    expect(visuals.center.decorations.some((d) => d.className.includes('addition'))).toBe(true)
  })

  it('renders a pure deletion as a boundary marker on the modified pane', () => {
    const block = makeBlock({
      theirsStartLine: 2,
      theirsLineCount: 1,
      oursStartLine: 2,
      oursLineCount: 0,
      theirsLines: ['gone'],
    })
    const visuals = computeTwoWayVisuals([block], placementFor(block), false)

    expect(visuals.center.decorations).toHaveLength(1)
    expect(visuals.center.decorations[0].className).toMatch(/^merge-marker-(top|bottom)-deletion$/)
    expect(visuals.theirs.decorations.some((d) => d.className.includes('deletion'))).toBe(true)
  })

  it('skips blocks without a placement entirely', () => {
    const block = makeBlock({ theirsStartLine: 1, theirsLineCount: 1, theirsLines: ['x'] })
    const visuals = computeTwoWayVisuals([block], new Map(), false)
    expect(visuals.theirs.decorations).toEqual([])
    expect(visuals.center.decorations).toEqual([])
  })
})
