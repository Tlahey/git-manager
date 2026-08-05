import { describe, expect, it } from 'vitest'
import { buildLineTopIndex } from './editorGeometry'

/** The original O(lines × ranges) walk `buildLineTopIndex` replaced, kept here as the oracle: the
 * index is a pure performance rewrite, so any input on which the two disagree is a regression in
 * pane alignment, connector geometry or scroll sync — none of which a rendering-free unit test
 * elsewhere would catch. */
function naiveTop(
  lineNumber: number,
  lineHeight: number,
  hiddenRanges: { start: number; end: number }[],
  viewZones: { afterLineNumber: number; heightInLines: number }[]
): number {
  if (lineNumber <= 1) return 0

  for (const range of hiddenRanges) {
    if (lineNumber >= range.start && lineNumber <= range.end) {
      return naiveTop(range.start - 1, lineHeight, hiddenRanges, viewZones) + lineHeight
    }
  }

  let y = 0
  for (let i = 1; i < lineNumber; i++) {
    let hidden = false
    for (const range of hiddenRanges) {
      if (i >= range.start && i <= range.end) {
        hidden = true
        break
      }
    }
    if (!hidden) y += lineHeight
    for (const zone of viewZones) {
      if (zone.afterLineNumber === i) y += zone.heightInLines * lineHeight
    }
  }
  return y
}

/** Deterministic PRNG — a fuzz test that picks different cases on every CI run is a flake, not a
 * stronger test. */
function makeRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

const LINE_HEIGHT = 19

describe('buildLineTopIndex vs. the original per-line walk', () => {
  it('agrees on the collapsed-diff shape (long unchanged blocks with banner zones)', () => {
    // 40 collapsed regions of 30 hidden lines each, one banner zone above every one of them —
    // the exact shape a large two-way diff produces.
    const hiddenRanges = Array.from({ length: 40 }, (_, i) => ({
      start: i * 50 + 4,
      end: i * 50 + 33,
    }))
    const viewZones = hiddenRanges.map((range) => ({
      afterLineNumber: range.start - 1,
      heightInLines: 1.5,
    }))
    const index = buildLineTopIndex(LINE_HEIGHT, hiddenRanges, viewZones)

    for (let line = 0; line <= 2050; line++) {
      expect(index.topFor(line)).toBeCloseTo(
        naiveTop(line, LINE_HEIGHT, hiddenRanges, viewZones),
        6
      )
    }
  })

  it('agrees on randomized range/zone layouts, including adjacent and zero-width cases', () => {
    const random = makeRandom(20260805)

    for (let iteration = 0; iteration < 60; iteration++) {
      const totalLines = 40 + Math.floor(random() * 160)

      const hiddenRanges: { start: number; end: number }[] = []
      let cursor = 1 + Math.floor(random() * 5)
      while (cursor < totalLines) {
        const length = Math.floor(random() * 8)
        const start = cursor
        const end = cursor + length
        hiddenRanges.push({ start, end })
        // A gap of 0 makes the next range ADJACENT to this one — the case merging would have
        // silently changed the result for.
        cursor = end + Math.floor(random() * 6)
      }

      const viewZones = Array.from({ length: Math.floor(random() * 10) }, () => ({
        afterLineNumber: Math.floor(random() * (totalLines + 2)),
        heightInLines: random() < 0.3 ? 0 : Math.floor(random() * 3) + 0.5,
      }))

      const index = buildLineTopIndex(LINE_HEIGHT, hiddenRanges, viewZones)

      for (let line = 0; line <= totalLines + 2; line++) {
        expect(
          index.topFor(line),
          `iteration ${iteration}, line ${line}, ranges ${JSON.stringify(hiddenRanges)}`
        ).toBeCloseTo(naiveTop(line, LINE_HEIGHT, hiddenRanges, viewZones), 6)
      }
    }
  })

  it('agrees when no lines are hidden at all (collapse toggled off)', () => {
    const viewZones = [
      { afterLineNumber: 0, heightInLines: 2 },
      { afterLineNumber: 1, heightInLines: 3 },
      { afterLineNumber: 7, heightInLines: 1 },
      { afterLineNumber: 7, heightInLines: 4 },
    ]
    const index = buildLineTopIndex(LINE_HEIGHT, [], viewZones)

    for (let line = 0; line <= 20; line++) {
      expect(index.topFor(line)).toBeCloseTo(naiveTop(line, LINE_HEIGHT, [], viewZones), 6)
    }
  })
})
