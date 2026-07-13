import { describe, expect, it } from 'vitest'
import type { BlockPlacement } from './mergeBlockLayout'
import type { MergeBlock } from './types'
import { computeInitialPlacements, updatePlacementAfterToggle } from './mergeBlockLayout'
import {
  changedCharRanges,
  computeIntraLineHighlights,
  computeTwoWayIntraLineHighlights,
} from './mergeIntraLineDiff'

describe('changedCharRanges — token-level intra-line diff', () => {
  it('returns empty ranges for identical lines', () => {
    expect(changedCharRanges('const user = 1', 'const user = 1')).toEqual({ a: [], b: [] })
  })

  it('pinpoints a single renamed word on both sides (the spec’s username/user example)', () => {
    const ranges = changedCharRanges('const username = "Jean";', 'const user = "Jean";')
    expect(ranges).toEqual({
      a: [{ start: 6, end: 14 }], // "username"
      b: [{ start: 6, end: 10 }], // "user"
    })
  })

  it('highlights a pure insertion only on the side that gained it', () => {
    const ranges = changedCharRanges('const user = 1;', 'const user = compute(1);')
    expect(ranges?.a).toEqual([])
    // "compute(" … ")" — the shared "1" splits the b-side into two runs.
    expect(ranges?.b).toEqual([
      { start: 13, end: 21 },
      { start: 22, end: 23 },
    ])
  })

  it('reports one run per changed segment, leaving shared words untouched', () => {
    const ranges = changedCharRanges('foo bar baz qux', 'foo BAR baz QUX')
    expect(ranges).toEqual({
      a: [
        { start: 4, end: 7 },
        { start: 12, end: 15 },
      ],
      b: [
        { start: 4, end: 7 },
        { start: 12, end: 15 },
      ],
    })
  })

  it('gives up (undefined) when the lines share no meaningful token — block fill says it all', () => {
    expect(changedCharRanges('return userCount', 'const x = 12')).toBeUndefined()
  })

  it('does not count shared whitespace alone as similarity', () => {
    expect(changedCharRanges('foo bar', 'baz qux')).toBeUndefined()
  })

  // Regression: JS's `\w` is ASCII-only, so a naive tokenizer splits an accented word like
  // "modifié" into "modifi" + "é" as two separate tokens — fragmenting the highlight (or, worse,
  // letting the lone "é" spuriously "match" an unrelated accented char elsewhere on the line).
  // `diffWordsWithSpace`'s word-character set covers Latin diacritics, so these stay whole.
  it('treats an accented word as one token instead of splitting off the diacritic', () => {
    const ranges = changedCharRanges('// café chaud', '// thé chaud')
    expect(ranges).toEqual({
      a: [{ start: 3, end: 7 }], // "café"
      b: [{ start: 3, end: 6 }], // "thé"
    })
  })

  it('highlights just the added word when it is itself accented, appended after shared text', () => {
    const ranges = changedCharRanges(
      '// Ceci est un commentaire',
      '// Ceci est un commentaire modifié'
    )
    expect(ranges?.a).toEqual([])
    expect(ranges?.b).toEqual([{ start: 26, end: 34 }]) // " modifié"
  })

  it('renames a word ending in a diacritic without fragmenting the accented character', () => {
    const ranges = changedCharRanges('const résumé = a;', 'const résumés = a;')
    expect(ranges).toEqual({
      a: [{ start: 6, end: 12 }], // "résumé"
      b: [{ start: 6, end: 13 }], // "résumés"
    })
  })

  // Regression: a whitespace-only edit must still highlight — it's a real content change, not
  // "nothing to compare" — so it can't be silently absorbed into a "common" token.
  it('highlights a whitespace-only change (trailing spaces added inside a comment)', () => {
    const ranges = changedCharRanges('// comment', '// comment  ')
    expect(ranges?.a).toEqual([])
    expect(ranges?.b).toEqual([{ start: 10, end: 12 }])
  })
})

function conflictBlocks(): MergeBlock[] {
  return [
    {
      blockId: 1,
      kind: 'unchanged',
      oursStartLine: 1,
      oursLineCount: 1,
      theirsStartLine: 1,
      theirsLineCount: 1,
      oursLines: ['header'],
      theirsLines: ['header'],
      baseLines: [],
    },
    {
      blockId: 2,
      kind: 'both-different',
      oursStartLine: 2,
      oursLineCount: 1,
      theirsStartLine: 2,
      theirsLineCount: 1,
      oursLines: ['const value = ours;'],
      theirsLines: ['const value = theirs;'],
      baseLines: [],
    },
  ]
}

// The center buffer as initially seeded: every block's ours-lines.
const initialCenterLines = ['header', 'const value = ours;']

describe('computeIntraLineHighlights', () => {
  it('initially highlights the differing word on the theirs pane and on the center, nothing on ours', () => {
    const blocks = conflictBlocks()
    const highlights = computeIntraLineHighlights(
      blocks,
      computeInitialPlacements(blocks),
      (n) => initialCenterLines[n - 1] ?? ''
    )

    // Ours is included — its center range is its own identical content.
    expect(highlights.ours).toEqual([])
    // "theirs" (cols 15–21) on the theirs pane; "ours" (cols 15–19) on the center; both red.
    expect(highlights.theirs).toEqual([
      { line: 2, startColumn: 15, endColumn: 21, inlineClassName: 'merge-inline-conflict' },
    ])
    expect(highlights.center).toEqual([
      { line: 2, startColumn: 15, endColumn: 19, inlineClassName: 'merge-inline-conflict' },
    ])
  })

  it('clears the highlights once theirs is pulled in (each side now faces its own content)', () => {
    const blocks = conflictBlocks()
    const placements = updatePlacementAfterToggle(
      computeInitialPlacements(blocks),
      blocks,
      blocks[1],
      'theirs',
      true
    )
    const centerLines = ['header', 'const value = ours;', 'const value = theirs;']

    const highlights = computeIntraLineHighlights(
      blocks,
      placements,
      (n) => centerLines[n - 1] ?? ''
    )

    expect(highlights.ours).toEqual([])
    expect(highlights.theirs).toEqual([])
    expect(highlights.center).toEqual([])
  })

  it('re-highlights against the live center text after a manual edit (real-time recompute)', () => {
    const blocks = conflictBlocks()
    // The user hand-edited the center's conflicting line: now both sides differ from it.
    const editedCenterLines = ['header', 'const value = edited;']

    const highlights = computeIntraLineHighlights(
      blocks,
      computeInitialPlacements(blocks),
      (n) => editedCenterLines[n - 1] ?? ''
    )

    expect(highlights.ours).toEqual([
      { line: 2, startColumn: 15, endColumn: 19, inlineClassName: 'merge-inline-conflict' },
    ])
    expect(highlights.theirs).toEqual([
      { line: 2, startColumn: 15, endColumn: 21, inlineClassName: 'merge-inline-conflict' },
    ])
    // Both comparisons target the same center word — one highlight from each side's pass.
    expect(highlights.center).toEqual([
      { line: 2, startColumn: 15, endColumn: 21, inlineClassName: 'merge-inline-conflict' },
      { line: 2, startColumn: 15, endColumn: 21, inlineClassName: 'merge-inline-conflict' },
    ])
  })

  it('never intra-highlights a pure insertion — there is no counterpart text to compare against', () => {
    const blocks: MergeBlock[] = [
      {
        blockId: 1,
        kind: 'theirs-only',
        oursStartLine: 1,
        oursLineCount: 0,
        theirsStartLine: 1,
        theirsLineCount: 2,
        oursLines: [],
        theirsLines: ['# --- ADDITION', 'theirs-metrics'],
        baseLines: [],
      },
    ]
    // Pulled in, then hand-edited in the center: the lines now differ from theirs again, and
    // WITHOUT the pure-insertion gate this would paint word-level highlights. WebStorm keeps
    // whole-block coloring only for insertions.
    const placements = updatePlacementAfterToggle(
      computeInitialPlacements(blocks),
      blocks,
      blocks[0],
      'theirs',
      true
    )
    const editedCenterLines = ['# --- ADDITION edited', 'theirs-metrics-tweaked']

    const highlights = computeIntraLineHighlights(
      blocks,
      placements,
      (n) => editedCenterLines[n - 1] ?? ''
    )

    expect(highlights.ours).toEqual([])
    expect(highlights.center).toEqual([])
    expect(highlights.theirs).toEqual([])
  })

  it('never intra-highlights a pure deletion — uniformly gray block instead', () => {
    const blocks: MergeBlock[] = [
      {
        blockId: 1,
        kind: 'theirs-only',
        oursStartLine: 1,
        oursLineCount: 2,
        theirsStartLine: 1,
        theirsLineCount: 0,
        oursLines: ['legacy-cache', 'legacy-session'],
        theirsLines: [],
        baseLines: [],
      },
    ]
    const highlights = computeIntraLineHighlights(
      blocks,
      computeInitialPlacements(blocks),
      (n) => ['legacy-cache', 'legacy-session'][n - 1] ?? ''
    )

    expect(highlights.ours).toEqual([])
    expect(highlights.center).toEqual([])
    expect(highlights.theirs).toEqual([])
  })

  it('never highlights auto-merged (unchanged/both-same) blocks even if the center text drifted', () => {
    const blocks = [conflictBlocks()[0]]
    const highlights = computeIntraLineHighlights(
      blocks,
      computeInitialPlacements(blocks),
      () => 'completely different'
    )
    expect(highlights.ours).toEqual([])
    expect(highlights.center).toEqual([])
    expect(highlights.theirs).toEqual([])
  })
})

/** 2-way placements mirror the block's `ours*` (modified-pane) geometry, like the resolver's
 * dynamic-view seeding does. */
function twoWayPlacementFor(block: MergeBlock): Map<number, BlockPlacement> {
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

describe('computeTwoWayIntraLineHighlights', () => {
  it('pinpoints the differing word on both the theirs pane and the center for a modification', () => {
    const block: MergeBlock = {
      blockId: 0,
      kind: 'theirs-only',
      theirsStartLine: 2,
      theirsLineCount: 1,
      oursStartLine: 2,
      oursLineCount: 1,
      oursLines: [],
      theirsLines: ['const value = theirs;'],
    }
    const centerLines = ['header', 'const value = modified;']

    const highlights = computeTwoWayIntraLineHighlights(
      [block],
      twoWayPlacementFor(block),
      (n) => centerLines[n - 1] ?? ''
    )

    expect(highlights.ours).toEqual([])
    expect(highlights.theirs).toEqual([
      { line: 2, startColumn: 15, endColumn: 21, inlineClassName: 'merge-inline-modification' },
    ])
    expect(highlights.center).toEqual([
      { line: 2, startColumn: 15, endColumn: 23, inlineClassName: 'merge-inline-modification' },
    ])
  })

  it('never intra-highlights a pure addition — there is no counterpart original text to compare against', () => {
    const block: MergeBlock = {
      blockId: 0,
      kind: 'theirs-only',
      theirsStartLine: 1,
      theirsLineCount: 0,
      oursStartLine: 1,
      oursLineCount: 2,
      oursLines: [],
      theirsLines: [],
    }
    const highlights = computeTwoWayIntraLineHighlights(
      [block],
      twoWayPlacementFor(block),
      (n) => ['new line one', 'new line two'][n - 1] ?? ''
    )
    expect(highlights.theirs).toEqual([])
    expect(highlights.center).toEqual([])
  })

  it('never intra-highlights a pure deletion — there is no counterpart modified text to compare against', () => {
    const block: MergeBlock = {
      blockId: 0,
      kind: 'theirs-only',
      theirsStartLine: 1,
      theirsLineCount: 2,
      oursStartLine: 1,
      oursLineCount: 0,
      oursLines: [],
      theirsLines: ['old line one', 'old line two'],
    }
    const highlights = computeTwoWayIntraLineHighlights(
      [block],
      twoWayPlacementFor(block),
      () => ''
    )
    expect(highlights.theirs).toEqual([])
    expect(highlights.center).toEqual([])
  })

  it('never intra-highlights a synthesized unchanged gap block, even if the center text somehow drifted', () => {
    const block: MergeBlock = {
      blockId: 0,
      kind: 'unchanged',
      theirsStartLine: 1,
      theirsLineCount: 1,
      oursStartLine: 1,
      oursLineCount: 1,
      oursLines: [],
      theirsLines: ['same line'],
    }
    const highlights = computeTwoWayIntraLineHighlights(
      [block],
      twoWayPlacementFor(block),
      () => 'completely different'
    )
    expect(highlights.theirs).toEqual([])
    expect(highlights.center).toEqual([])
  })

  it('produces no highlight when the two lines are identical', () => {
    const block: MergeBlock = {
      blockId: 0,
      kind: 'theirs-only',
      theirsStartLine: 1,
      theirsLineCount: 1,
      oursStartLine: 1,
      oursLineCount: 1,
      oursLines: [],
      theirsLines: ['same line'],
    }
    const highlights = computeTwoWayIntraLineHighlights([block], twoWayPlacementFor(block), () => 'same line')
    expect(highlights.theirs).toEqual([])
    expect(highlights.center).toEqual([])
  })
})
