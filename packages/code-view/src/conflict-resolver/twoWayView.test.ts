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
  it('maps a modification to a theirs-only block flanked by synthesized unchanged gaps', () => {
    const view = buildDynamicMergeView('line1\noriginal\nline3', [lineChange(2, 2, 2, 2)])

    expect(view.theirsText).toBe('line1\noriginal\nline3')
    expect(view.oursText).toBe('')
    expect(view.blocks).toHaveLength(3)
    expect(view.blocks[1]).toEqual({
      blockId: 1,
      kind: 'theirs-only',
      oursStartLine: 2,
      oursLineCount: 1,
      theirsStartLine: 2,
      theirsLineCount: 1,
      oursLines: [],
      theirsLines: ['original'],
      baseLines: ['original'],
    })
    expect(view.blocks[0]).toMatchObject({
      kind: 'unchanged',
      theirsStartLine: 1,
      theirsLineCount: 1,
      oursStartLine: 1,
      oursLineCount: 1,
    })
    expect(view.blocks[2]).toMatchObject({
      kind: 'unchanged',
      theirsStartLine: 3,
      theirsLineCount: 1,
      oursStartLine: 3,
      oursLineCount: 1,
    })
  })

  it('maps a pure insertion (originalEnd 0) to a zero-count original range with no theirs lines', () => {
    const view = buildDynamicMergeView('line1\nline2', [lineChange(1, 0, 2, 2)])

    // theirsStartLine is bumped to 2 (originalStartLineNumber + 1): Monaco's raw `1` means
    // "insert after original line 1", which this package's shared convention expresses as
    // "insert before line 2" — see the comment in `buildDynamicMergeView`.
    expect(view.blocks).toHaveLength(3)
    expect(view.blocks[1]).toMatchObject({
      kind: 'theirs-only',
      theirsStartLine: 2,
      theirsLineCount: 0,
      oursStartLine: 2,
      oursLineCount: 1,
      theirsLines: [],
    })
  })

  it('maps a pure deletion (modifiedEnd 0) to a zero-count modified range keeping the deleted lines', () => {
    const view = buildDynamicMergeView('line1\nold1\nold2\nline4', [lineChange(2, 3, 1, 0)])

    // oursStartLine is bumped to 2 (modifiedStartLineNumber + 1) for the same reason as above.
    expect(view.blocks).toHaveLength(3)
    expect(view.blocks[1]).toMatchObject({
      kind: 'theirs-only',
      theirsStartLine: 2,
      theirsLineCount: 2,
      oursStartLine: 2,
      oursLineCount: 0,
      theirsLines: ['old1', 'old2'],
      baseLines: ['old1', 'old2'],
    })
  })

  it('regression: a deletion nested inside a block anchors after its opening line, not before it', () => {
    // Real Monaco output for a `{ level: 'info', verbose: false }` pair removed from inside a
    // `logging: {` / `},` block (originalStartLineNumber=7 is 'logging: {'+1, i.e. the deleted
    // lines start right after it) — reported as rendering one line too early, appearing to
    // delete content *above* `logging: {` instead of the two properties inside it.
    const view = buildDynamicMergeView('...', [
      { originalStartLineNumber: 7, originalEndLineNumber: 8, modifiedStartLineNumber: 6, modifiedEndLineNumber: 0, charChanges: undefined },
    ])
    const change = view.blocks.find((b) => b.kind === 'theirs-only')
    // oursStartLine=7 anchors the marker right before modified line 7 — i.e. after line 6
    // ('logging: {'), not before it.
    expect(change).toMatchObject({ oursStartLine: 7, oursLineCount: 0 })
  })

  it('regression: an insertion after a line anchors before the following line, not before the anchor itself', () => {
    // Real Monaco output for `strategy`/`telemetry` inserted right after `ttl: 60,` (original
    // line 12) — reported as rendering one line too early, appearing to insert *above* `ttl: 60,`
    // instead of below it.
    const view = buildDynamicMergeView('...', [
      { originalStartLineNumber: 12, originalEndLineNumber: 0, modifiedStartLineNumber: 11, modifiedEndLineNumber: 12, charChanges: undefined },
    ])
    const change = view.blocks.find((b) => b.kind === 'theirs-only')
    // theirsStartLine=13 anchors the marker right before original line 13 ('},') — i.e. after
    // line 12 ('ttl: 60,'), not before it.
    expect(change).toMatchObject({ theirsStartLine: 13, theirsLineCount: 0 })
  })

  it('assigns sequential block ids across changes and the synthesized gaps between them', () => {
    const view = buildDynamicMergeView('a\nb\nc\nd', [
      lineChange(1, 1, 1, 1),
      lineChange(3, 3, 3, 3),
    ])
    // a|b|c|d: change on 'a', unchanged gap on 'b', change on 'c', trailing gap on 'd'.
    expect(view.blocks.map((b) => b.blockId)).toEqual([0, 1, 2, 3])
    expect(view.blocks.map((b) => b.kind)).toEqual([
      'theirs-only',
      'unchanged',
      'theirs-only',
      'unchanged',
    ])
  })

  it('synthesizes one whole-file unchanged block when there are no changes at all', () => {
    const view = buildDynamicMergeView('a\nb\nc', [])

    expect(view.blocks).toEqual([
      {
        blockId: 0,
        kind: 'unchanged',
        oursStartLine: 1,
        oursLineCount: 3,
        theirsStartLine: 1,
        theirsLineCount: 3,
        oursLines: [],
        theirsLines: ['a', 'b', 'c'],
      },
    ])
  })

  it('omits the leading gap when a change starts on line 1, and the trailing gap when it reaches the last line', () => {
    const view = buildDynamicMergeView('a\nb', [lineChange(1, 2, 1, 2)])

    expect(view.blocks).toHaveLength(1)
    expect(view.blocks[0]).toMatchObject({
      kind: 'theirs-only',
      theirsStartLine: 1,
      theirsLineCount: 2,
      oursStartLine: 1,
      oursLineCount: 2,
    })
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

  it('uses the subtle merge-text-* fill by default (words highlight mode pairs it with an intra-line overlay)', () => {
    const block = makeBlock({
      theirsStartLine: 2,
      theirsLineCount: 1,
      oursStartLine: 2,
      oursLineCount: 1,
      theirsLines: ['x'],
    })
    const visuals = computeTwoWayVisuals([block], placementFor(block), false)

    expect(visuals.theirs.decorations.some((d) => d.className.includes('merge-text-modification'))).toBe(
      true
    )
    expect(
      visuals.theirs.decorations.some((d) => d.className.includes('merge-vivid-modification'))
    ).toBe(false)
  })

  it('switches to the louder merge-vivid-* fill when useVividText is on (lines highlight mode)', () => {
    const block = makeBlock({
      theirsStartLine: 2,
      theirsLineCount: 1,
      oursStartLine: 2,
      oursLineCount: 1,
      theirsLines: ['x'],
    })
    const visuals = computeTwoWayVisuals([block], placementFor(block), false, true)

    expect(
      visuals.theirs.decorations.some((d) => d.className.includes('merge-vivid-modification'))
    ).toBe(true)
    expect(
      visuals.center.decorations.some((d) => d.className.includes('merge-vivid-modification'))
    ).toBe(true)
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
