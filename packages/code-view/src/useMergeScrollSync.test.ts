import { describe, expect, it } from 'vitest'
import type { editor } from 'monaco-editor'
import type { MergeBlock } from './types'
import { getScrollCoordinatesForContent } from './useMergeScrollSync'
import { computeInitialPlacements } from './mergeBlockLayout'
import { getTopForLineNumberSafe } from './conflict-resolver/editorGeometry'

function createBlock(overrides: Partial<MergeBlock> & Pick<MergeBlock, 'blockId' | 'kind'>): MergeBlock {
  return {
    oursStartLine: 1,
    oursLineCount: 0,
    theirsStartLine: 1,
    theirsLineCount: 0,
    oursLines: [],
    theirsLines: [],
    baseLines: [],
    ...overrides,
  }
}

function mockEditor(lineCount: number, lineHeights: Record<number, number> = {}) {
  return {
    getModel: () => ({
      getLineCount: () => lineCount,
    }),
    getTopForLineNumber: (line: number) => {
      let top = 0
      for (let i = 1; i < line; i++) {
        top += lineHeights[i] ?? 19
      }
      return top
    },
  } as unknown as editor.IStandaloneCodeEditor
}

describe('getScrollCoordinatesForContent', () => {
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

    const masterEditor = mockEditor(5)
    const slaveEditor = mockEditor(5)

    // Master is Center (index 1), Slave is Ours (index 2)
    // Line height is 19px.
    // Line 3 is at Y = 38px
    const targetScroll = getScrollCoordinatesForContent(
      masterEditor,
      slaveEditor,
      38,
      blocks,
      placements,
      1,
      2
    )

    expect(targetScroll).toBe(38)
  })

  it('interpolates modified blocks linearly with different line counts', () => {
    const blocks = [
      createBlock({
        blockId: 1,
        kind: 'both-different',
        oursStartLine: 1,
        oursLineCount: 4, // Ours has 4 lines: height = 4 * 19 = 76px
        theirsStartLine: 1,
        theirsLineCount: 2, // Theirs has 2 lines: height = 2 * 19 = 38px
      }),
    ]
    // Center includes only ours (default)
    const placements = computeInitialPlacements(blocks)

    const masterEditor = mockEditor(4) // Center has ours (4 lines)
    const slaveEditor = mockEditor(2)  // Theirs has 2 lines

    // Master is Center (index 1), Slave is Theirs (index 0)
    // Middle of Master: Y = 38px (half of 76px)
    let targetScroll = getScrollCoordinatesForContent(
      masterEditor,
      slaveEditor,
      38,
      blocks,
      placements,
      1,
      0
    )
    expect(targetScroll).toBe(19) // Half of 38px is 19px

    // End of Master block: Y = 76px
    targetScroll = getScrollCoordinatesForContent(
      masterEditor,
      slaveEditor,
      76,
      blocks,
      placements,
      1,
      0
    )
    expect(targetScroll).toBe(38)
  })

  it('freezes the slave editor when master scrolls in exclusive code', () => {
    // Block 1: ours-only deletion (theirs has 5 lines, ours has 0 lines)
    // Block 2: unchanged (5 lines)
    const blocks = [
      createBlock({
        blockId: 1,
        kind: 'ours-only',
        theirsStartLine: 1,
        theirsLineCount: 5,
        oursStartLine: 1,
        oursLineCount: 0,
      }),
      createBlock({
        blockId: 2,
        kind: 'unchanged',
        theirsStartLine: 6,
        theirsLineCount: 5,
        oursStartLine: 1,
        oursLineCount: 5,
      }),
    ]

    const placements = computeInitialPlacements(blocks)
    // Default placements for ours-only deletion: Center shows theirs (theirsIncluded = true, 5 lines)
    // So:
    // Center (Master) has Block 1 (5 lines), Block 2 (5 lines) -> Total 10 lines
    // Ours (Slave) has Block 1 (0 lines), Block 2 (5 lines) -> Total 5 lines

    const masterEditor = mockEditor(10) // Center
    const slaveEditor = mockEditor(5)   // Ours

    // Scrolling in Block 1 (Y from 0 to 95 in Master). Slave has 0 lines here and should freeze at 0.
    for (let scrollTop = 0; scrollTop < 95; scrollTop += 10) {
      const targetScroll = getScrollCoordinatesForContent(
        masterEditor,
        slaveEditor,
        scrollTop,
        blocks,
        placements,
        1, // Center
        2  // Ours
      )
      expect(targetScroll).toBe(0)
    }

    // Entering Block 2 in Master (scrollTop >= 95). Slave should unfreeze and scroll.
    // At scrollTop = 95 (start of Block 2), Slave should be at 0.
    let targetScroll = getScrollCoordinatesForContent(
      masterEditor,
      slaveEditor,
      95,
      blocks,
      placements,
      1,
      2
    )
    expect(targetScroll).toBe(0)

    // Halfway through Block 2: scrollTop = 95 + 47.5 = 142.5
    targetScroll = getScrollCoordinatesForContent(
      masterEditor,
      slaveEditor,
      142.5,
      blocks,
      placements,
      1,
      2
    )
    // Actually, in Slave, Block 2 starts at line 1, so its Y start is 0, height is 5 * 19 = 95px.
    // So half of 95px is 47.5px.
    // Let's compute: Master starts Block 2 at Y = 95, ends at Y = 190. masterHeight = 95.
    // At scrollTop = 142.5, fraction = (142.5 - 95) / 95 = 0.5.
    // Slave coords for Block 2: startLine = 1, lineCount = 5. yStart = 0, yEnd = 95. slaveHeight = 95.
    // targetScroll = 0 + 0.5 * 95 = 47.5.
    expect(targetScroll).toBe(47.5)
  })

  it('extrapolates scrolling beyond the last block', () => {
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

    const masterEditor = mockEditor(5)
    const slaveEditor = mockEditor(5)

    // Master ends at Y = 5 * 19 = 95px.
    // Scroll Master past the end to 120px (+25px).
    const targetScroll = getScrollCoordinatesForContent(
      masterEditor,
      slaveEditor,
      120,
      blocks,
      placements,
      1,
      2
    )

    expect(targetScroll).toBe(120)
  })

  it('calculates top coordinate correctly for line 21 when 4-17 is collapsed', () => {
    const editor = mockEditor(23)
    const hiddenRanges = [{ start: 4, end: 17 }]
    const viewZones = [{ afterLineNumber: 3, heightInLines: 1.5 }]
    const resultY = getTopForLineNumberSafe(editor, 21, 19, hiddenRanges, viewZones)
    expect(resultY).toBe(142.5)
  })
})
