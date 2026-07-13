import { diffWordsWithSpace } from 'diff'
import type { MergeBlock } from './types'
import {
  changeKindForBlock,
  connectorCenterRangeForSide,
  isChangeSource,
  sideColorToken,
  type BlockPlacement,
  type MergeSide,
} from './mergeBlockLayout'

/** A changed span of characters within one line — 0-based, `end` exclusive. */
export interface CharRange {
  start: number
  end: number
}

/** One Monaco `inlineClassName` decoration to apply: highlights just `[startColumn, endColumn)`
 * (1-based, exclusive end — Monaco's own column convention) of one line, on top of the block's
 * whole-line fill. */
export interface InlineDecorationSpec {
  line: number
  startColumn: number
  endColumn: number
  inlineClassName: string
}

export interface MergeIntraLineHighlights {
  ours: InlineDecorationSpec[]
  center: InlineDecorationSpec[]
  theirs: InlineDecorationSpec[]
}

/** Character-precise intra-line diff of two versions of "the same" line: which spans of `a` and
 * `b` actually changed. Delegates the actual word-tokenization/diffing to `jsdiff`'s
 * `diffWordsWithSpace` rather than a hand-rolled LCS: its word-character set covers Latin
 * diacritics/Unicode letter ranges (see `diff/word.js`'s `extendedWordChars`), where a naive
 * `\w`-based tokenizer (JS's `\w` is ASCII-only) would split an accented word like "modifié" into
 * "modifi" + "é" as two separate tokens — fragmenting the highlight and occasionally letting the
 * lone accented character spuriously "match" an unrelated one elsewhere on the line. It also
 * preserves whitespace as its own token type (`WithSpace`), so a change that's purely whitespace
 * (e.g. trailing spaces added inside a comment) still highlights instead of being silently
 * absorbed into a "common" token. jsdiff's Myers-diff core is O((N+M)D) in the edit distance
 * rather than the O(N·M) DP table this used to build, so there's no separate long-line fallback
 * needed either.
 *
 * Returns `undefined` when the two lines share no meaningful (non-whitespace) token — they're
 * not really "the same line edited", so an intra highlight would just repaint almost everything
 * in a louder color; the block-level fill already conveys "this whole line differs". */
export function changedCharRanges(
  a: string,
  b: string
): { a: CharRange[]; b: CharRange[] } | undefined {
  if (a === b) return { a: [], b: [] }

  const changes = diffWordsWithSpace(a, b)

  let sharesMeaningfulToken = false
  for (const part of changes) {
    if (!part.added && !part.removed && /\S/.test(part.value)) {
      sharesMeaningfulToken = true
      break
    }
  }
  if (!sharesMeaningfulToken) return undefined

  const rangesA: CharRange[] = []
  const rangesB: CharRange[] = []
  let offsetA = 0
  let offsetB = 0
  for (const part of changes) {
    const length = part.value.length
    if (part.removed) {
      rangesA.push({ start: offsetA, end: offsetA + length })
      offsetA += length
    } else if (part.added) {
      rangesB.push({ start: offsetB, end: offsetB + length })
      offsetB += length
    } else {
      offsetA += length
      offsetB += length
    }
  }

  return { a: rangesA, b: rangesB }
}

/** Second pass of the two-pass diff: within each (already line-classified) block, pinpoint the
 * exact words/symbols that differ between a side pane and the center, on both ends at once —
 * the side pane shows what would come in, the center shows what it would replace.
 *
 * Each side is compared against the same center range its connector ribbon targets
 * (`connectorCenterRangeForSide`): its own sub-range when the side is included — which is then
 * usually identical, so nothing highlights once a side has been pulled in — or the block's whole
 * currently-shown center content when it isn't. Lines pair up positionally (side line i ↔ center
 * line i); a block's surplus lines beyond the shorter of the two have no counterpart to compare
 * against and stay covered by the block fill alone.
 *
 * Reads the center's *live* text through `getCenterLine` rather than trusting the block's own
 * lines, so free-form typing in the center re-derives these highlights on the same pass that
 * re-derives placements — edit the conflicting word in the center to match a side and that
 * side's highlight disappears by itself, because the delta hit zero. */
export function computeIntraLineHighlights(
  blocks: MergeBlock[],
  placements: Map<number, BlockPlacement>,
  getCenterLine: (lineNumber: number) => string
): MergeIntraLineHighlights {
  const out: MergeIntraLineHighlights = { ours: [], center: [], theirs: [] }

  for (const block of blocks) {
    const placement = placements.get(block.blockId)
    if (!placement) continue

    // Intra-line highlighting only makes sense where the same line exists in two versions and
    // was *edited* — modifications and conflicts. A pure insertion or deletion has no
    // counterpart text to compare character-by-character (WebStorm shows those as uniformly
    // colored blocks); pairing their lines against whatever happens to occupy the center range
    // would just paint noisy coincidental word matches.
    const kind = changeKindForBlock(block)
    if (kind === 'addition' || kind === 'deletion') continue

    for (const side of ['ours', 'theirs'] as MergeSide[]) {
      if (!isChangeSource(block, side)) continue

      const touched = side === 'ours' ? placement.oursTouched : placement.theirsTouched
      const token = sideColorToken(block, touched)
      if (!token) continue // auto-merged blocks never highlight

      const sideLines = side === 'ours' ? block.oursLines : block.theirsLines
      const sideStartLine = side === 'ours' ? block.oursStartLine : block.theirsStartLine
      if (sideLines.length === 0) continue

      const centerRange = connectorCenterRangeForSide(placement, block, side)
      const pairCount = Math.min(sideLines.length, centerRange.count)
      const inlineClassName = `merge-inline-${token}`

      for (let i = 0; i < pairCount; i++) {
        const sideText = sideLines[i]
        const centerText = getCenterLine(centerRange.start + i)
        if (sideText === centerText) continue

        const ranges = changedCharRanges(sideText, centerText)
        if (!ranges) continue

        for (const r of ranges.a) {
          out[side].push({
            line: sideStartLine + i,
            startColumn: r.start + 1,
            endColumn: r.end + 1,
            inlineClassName,
          })
        }
        for (const r of ranges.b) {
          out.center.push({
            line: centerRange.start + i,
            startColumn: r.start + 1,
            endColumn: r.end + 1,
            inlineClassName,
          })
        }
      }
    }
  }

  return out
}

/** 2-panel counterpart of `computeIntraLineHighlights` above: pinpoints the exact words/symbols
 * that differ between the original (theirs) and modified (center) lines of a modification hunk.
 * Additions/deletions have no counterpart line to compare against and stay covered by the
 * block's whole-line fill alone — same rule as the 3-way version. There's no `ours` pane in this
 * mode, so that slot always stays empty. */
export function computeTwoWayIntraLineHighlights(
  blocks: MergeBlock[],
  placements: Map<number, BlockPlacement>,
  getCenterLine: (lineNumber: number) => string
): MergeIntraLineHighlights {
  const out: MergeIntraLineHighlights = { ours: [], center: [], theirs: [] }
  const inlineClassName = 'merge-inline-modification'

  for (const block of blocks) {
    if (block.kind !== 'theirs-only') continue
    const placement = placements.get(block.blockId)
    if (!placement) continue

    const theirsLines = block.theirsLines
    if (theirsLines.length === 0 || placement.centerLineCount === 0) continue

    const theirsStartLine = block.theirsStartLine
    const centerStartLine = placement.centerStartLine
    const pairCount = Math.min(theirsLines.length, placement.centerLineCount)

    for (let i = 0; i < pairCount; i++) {
      const theirsText = theirsLines[i]
      const centerText = getCenterLine(centerStartLine + i)
      if (theirsText === centerText) continue

      const ranges = changedCharRanges(theirsText, centerText)
      if (!ranges) continue

      for (const r of ranges.a) {
        out.theirs.push({
          line: theirsStartLine + i,
          startColumn: r.start + 1,
          endColumn: r.end + 1,
          inlineClassName,
        })
      }
      for (const r of ranges.b) {
        out.center.push({
          line: centerStartLine + i,
          startColumn: r.start + 1,
          endColumn: r.end + 1,
          inlineClassName,
        })
      }
    }
  }

  return out
}
