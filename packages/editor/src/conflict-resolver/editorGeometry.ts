import type { editor } from 'monaco-editor'

/** A collapsed (hidden) line range, both bounds inclusive and 1-based. */
export interface HiddenRange {
  start: number
  end: number
}

/** A view zone's vertical footprint: `heightInLines` inserted right below `afterLineNumber`. */
export interface ZoneSpan {
  afterLineNumber: number
  heightInLines: number
}

/** Precomputed line-top geometry for ONE pane: answers `topFor(line)` in O(log n) instead of
 * walking the document. */
export interface LineTopIndex {
  topFor: (lineNumber: number) => number
}

/** Builds the O(log n) lookup structure behind `getTopForLineNumberSafe`.
 *
 * The naive form of this — walking every line from 1 to `lineNumber`, and for each one scanning
 * every hidden range and every view zone — is what it replaces, and the difference is not a
 * micro-optimization: `getTop` is called ~4× per block by the connector builder and ~2× per block
 * by the scroll sync **on every scroll event**, so the walk made scrolling cost
 * O(blocks × lines × ranges). On a 10k-line file with 200 hunks that measured ~770ms for a single
 * scroll tick, i.e. a hard freeze. Keep this index-based: any change that reintroduces a per-line
 * loop here reintroduces the freeze, and it only shows up on large files (small diffs stay fast
 * either way, which is why it survived so long).
 *
 * Semantics are identical to the walk it replaces:
 * - line ≤ 1 → 0
 * - a line inside a hidden range resolves to the bottom of the last visible line above the range
 * - otherwise: (visible lines above it) × lineHeight + (view-zone lines anchored after lines
 *   1..line-1) × lineHeight. Zones anchored after line 0 are deliberately not counted — they sit
 *   above the first line, exactly as the walk (which started at i = 1) treated them. */
export function buildLineTopIndex(
  lineHeight: number,
  hiddenRanges: readonly HiddenRange[],
  viewZones: readonly ZoneSpan[]
): LineTopIndex {
  // Union of the hidden ranges, sorted. Overlapping ranges are merged (the union's *size* is what
  // the prefix sums need, and merging doesn't change it); merely ADJACENT ranges are deliberately
  // left separate, because a hidden line resolves through the chain of ranges above it one range
  // at a time and merging two touching ranges would swallow one lineHeight of that chain.
  const sorted = hiddenRanges
    .filter((range) => range.end >= range.start)
    .slice()
    .sort((a, b) => a.start - b.start)
  const merged: HiddenRange[] = []
  for (const range of sorted) {
    const last = merged[merged.length - 1]
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end)
      continue
    }
    merged.push({ start: range.start, end: range.end })
  }

  // hiddenBefore[i] = how many lines the ranges before `merged[i]` hide.
  const hiddenBefore: number[] = []
  let hiddenAcc = 0
  for (const range of merged) {
    hiddenBefore.push(hiddenAcc)
    hiddenAcc += range.end - range.start + 1
  }

  /** How many lines in [1, line] are hidden. */
  const hiddenCountUpTo = (line: number): number => {
    if (line < 1 || merged.length === 0) return 0
    let lo = 0
    let hi = merged.length - 1
    let found = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (merged[mid].start <= line) {
        found = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    if (found === -1) return 0
    const range = merged[found]
    return hiddenBefore[found] + Math.min(line, range.end) - range.start + 1
  }

  /** The merged range containing `line`, or undefined — the fast "is this line hidden at all?"
   * test, so the (rare) hidden-line branch is the only one that pays a linear scan. */
  const mergedRangeContaining = (line: number): HiddenRange | undefined => {
    let lo = 0
    let hi = merged.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (merged[mid].end < line) lo = mid + 1
      else if (merged[mid].start > line) hi = mid - 1
      else return merged[mid]
    }
    return undefined
  }

  const zones = viewZones
    .filter((zone) => zone.afterLineNumber >= 1)
    .slice()
    .sort((a, b) => a.afterLineNumber - b.afterLineNumber)
  const zoneAnchors = zones.map((zone) => zone.afterLineNumber)
  // zonePrefix[i] = total height (in lines) of zones[0..i-1].
  const zonePrefix: number[] = [0]
  for (const zone of zones) {
    zonePrefix.push(zonePrefix[zonePrefix.length - 1] + zone.heightInLines)
  }

  /** Total zone height (in lines) anchored after any line in [1, line]. */
  const zoneHeightUpTo = (line: number): number => {
    if (line < 1 || zones.length === 0) return 0
    let lo = 0
    let hi = zones.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (zoneAnchors[mid] <= line) lo = mid + 1
      else hi = mid
    }
    return zonePrefix[lo]
  }

  const topFor = (lineNumber: number): number => {
    if (lineNumber <= 1) return 0

    if (mergedRangeContaining(lineNumber)) {
      // Resolve against the ORIGINAL array's first matching range, not the merged one: with
      // overlapping input ranges the two can differ, and the walk this replaces used array order.
      const range = hiddenRanges.find((r) => lineNumber >= r.start && lineNumber <= r.end)
      if (range) return topFor(range.start - 1) + lineHeight
    }

    const visibleLines = lineNumber - 1 - hiddenCountUpTo(lineNumber - 1)
    return (visibleLines + zoneHeightUpTo(lineNumber - 1)) * lineHeight
  }

  return { topFor }
}

/** Computes a line's top Y offset (content space, before scroll), skipping lines inside hidden
 * (collapsed) ranges and adding the height of any view zone anchored above it — Monaco's own
 * `getTopForLineNumber` can't be trusted here because it throws for lines inside `setHiddenAreas`
 * ranges. A line that is itself hidden resolves to the bottom of the last visible line before its
 * range.
 *
 * One-shot convenience wrapper: it rebuilds the index on every call, so it is for tests and cold
 * paths only. Anything that resolves more than a couple of lines per state (the connector builder,
 * the scroll sync — see `useLineTopGeometry`) must build the index once and reuse it. */
export function getTopForLineNumberSafe(
  // Kept for interface parity with the `getTop`-shaped callback (see useMergeScrollSync/useMergeConnectors),
  // whose other implementation calls a method on the editor instance — this one just doesn't need it.
  _editor: editor.IStandaloneCodeEditor,
  lineNumber: number,
  lineHeight: number,
  hiddenRanges: HiddenRange[],
  viewZones: ZoneSpan[]
): number {
  return buildLineTopIndex(lineHeight, hiddenRanges, viewZones).topFor(lineNumber)
}
