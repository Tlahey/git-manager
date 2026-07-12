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

interface Token {
  text: string
  start: number
  end: number
}

/** Words, whitespace runs, and single punctuation characters — fine enough that `username` vs
 * `user` or `=` vs `+=` highlight as their own units, coarse enough that the LCS below stays
 * tiny for realistic lines. */
function tokenize(line: string): Token[] {
  const tokens: Token[] = []
  const re = /\w+|\s+|[^\w\s]/g
  let match: RegExpExecArray | null
  while ((match = re.exec(line))) {
    tokens.push({ text: match[0], start: match.index, end: match.index + match[0].length })
  }
  return tokens
}

/** Collapses each maximal run of unmatched tokens into one contiguous highlight range. */
function unmatchedRuns(tokens: Token[], matched: boolean[]): CharRange[] {
  const ranges: CharRange[] = []
  for (let i = 0; i < tokens.length; i++) {
    if (matched[i]) continue
    const start = tokens[i].start
    while (i + 1 < tokens.length && !matched[i + 1]) i++
    ranges.push({ start, end: tokens[i].end })
  }
  return ranges
}

// Above this, the O(n·m) LCS table isn't worth building for a single line — fall back to the
// cheap common-prefix/common-suffix trim (one highlight spanning the whole edited middle).
const MAX_LCS_CELLS = 160_000

function prefixSuffixRanges(a: string, b: string): { a: CharRange[]; b: CharRange[] } | undefined {
  let prefix = 0
  const max = Math.min(a.length, b.length)
  while (prefix < max && a[prefix] === b[prefix]) prefix++
  let suffix = 0
  while (suffix < max - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++
  if (prefix === 0 && suffix === 0) return undefined // nothing in common — block fill says it all
  const rangesA: CharRange[] =
    prefix < a.length - suffix ? [{ start: prefix, end: a.length - suffix }] : []
  const rangesB: CharRange[] =
    prefix < b.length - suffix ? [{ start: prefix, end: b.length - suffix }] : []
  return { a: rangesA, b: rangesB }
}

/** Character-precise intra-line diff of two versions of "the same" line: which spans of `a` and
 * `b` actually changed. Token-level LCS (not a per-character diff): highlights whole changed
 * words/symbols, which is what reads well at a glance — `diff-match-patch`-style char diffs tend
 * to latch onto coincidental shared letters inside unrelated words.
 *
 * Returns `undefined` when the two lines share no meaningful (non-whitespace) token — they're
 * not really "the same line edited", so an intra highlight would just repaint almost everything
 * in a louder color; the block-level fill already conveys "this whole line differs". */
export function changedCharRanges(
  a: string,
  b: string
): { a: CharRange[]; b: CharRange[] } | undefined {
  if (a === b) return { a: [], b: [] }

  const tokensA = tokenize(a)
  const tokensB = tokenize(b)
  if (tokensA.length * tokensB.length > MAX_LCS_CELLS) return prefixSuffixRanges(a, b)

  // Standard LCS lengths table over token texts…
  const n = tokensA.length
  const m = tokensB.length
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        tokensA[i].text === tokensB[j].text
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  // …then walk it to mark which tokens survive on both sides.
  const matchedA = new Array<boolean>(n).fill(false)
  const matchedB = new Array<boolean>(m).fill(false)
  let sharesMeaningfulToken = false
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (tokensA[i].text === tokensB[j].text) {
      matchedA[i] = true
      matchedB[j] = true
      if (/\S/.test(tokensA[i].text)) sharesMeaningfulToken = true
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++
    } else {
      j++
    }
  }

  if (!sharesMeaningfulToken) return undefined
  return { a: unmatchedRuns(tokensA, matchedA), b: unmatchedRuns(tokensB, matchedB) }
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
