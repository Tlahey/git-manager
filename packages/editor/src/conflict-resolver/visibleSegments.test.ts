import { describe, expect, it } from 'vitest'
import type { ConnectorSegment } from '../MergeConnectorOverlay'
import { EMPTY_SEGMENT_WINDOW, sameSegmentWindow, visibleSegmentWindow } from './visibleSegments'

function segment(index: number, leftY0: number, rightY0 = leftY0, height = 20): ConnectorSegment {
  return {
    id: index,
    leftY0,
    leftY1: leftY0 + height,
    rightY0,
    rightY1: rightY0 + height,
    colorClass: 'merge-connector-modification',
    actionable: false,
  }
}

/** 200 segments, one every 100px — a long diff. */
const LONG_DIFF = Array.from({ length: 200 }, (_, i) => segment(i, i * 100))
const VIEWPORT = 500

describe('visibleSegmentWindow', () => {
  it('is empty for an empty segment list', () => {
    expect(visibleSegmentWindow([], 0, 0, VIEWPORT)).toEqual(EMPTY_SEGMENT_WINDOW)
  })

  it('keeps only a bounded slice of a long diff, wherever it is scrolled', () => {
    const atTop = visibleSegmentWindow(LONG_DIFF, 0, 0, VIEWPORT, 300)
    const atMiddle = visibleSegmentWindow(LONG_DIFF, 9_000, 9_000, VIEWPORT, 300)
    const atBottom = visibleSegmentWindow(LONG_DIFF, 19_500, 19_500, VIEWPORT, 300)

    for (const window of [atTop, atMiddle, atBottom]) {
      // (500 viewport + 2 * 300 overscan) / 100px spacing ≈ 12 segments, never the 200.
      expect(window.end - window.start).toBeLessThanOrEqual(13)
    }
    expect(atMiddle.start).toBeGreaterThan(atTop.end)
    expect(atBottom.start).toBeGreaterThan(atMiddle.end)
  })

  it('includes every segment whose band overlaps the viewport', () => {
    const window = visibleSegmentWindow(LONG_DIFF, 1_000, 1_000, VIEWPORT, 0)
    // Scrolled to 1000 with a 500px viewport: segments at 1000..1500 inclusive of their height.
    for (let i = window.start; i < window.end; i++) {
      const segment = LONG_DIFF[i]
      expect(segment.leftY1 - 1_000).toBeGreaterThanOrEqual(0)
      expect(segment.leftY0 - 1_000).toBeLessThanOrEqual(VIEWPORT)
    }
    expect(window.end - window.start).toBeGreaterThan(0)
  })

  it('keeps a steeply sloped ribbon whose two ends straddle the viewport', () => {
    // Left end far above the band, right end far below it: the filled ribbon crosses the whole
    // viewport, so testing either end alone would wrongly drop it.
    const straddling = [segment(0, -2_000, 3_000)]
    expect(visibleSegmentWindow(straddling, 0, 0, VIEWPORT, 0)).toEqual({ start: 0, end: 1 })
  })

  it('accounts for the two panes scrolling by different amounts', () => {
    const segments = [segment(0, 5_000, 200)]
    // Off screen on the left pane's own scroll, on screen on the right pane's.
    expect(visibleSegmentWindow(segments, 0, 0, VIEWPORT, 0)).toEqual({ start: 0, end: 1 })
    // Both ends now far away.
    expect(visibleSegmentWindow(segments, 20_000, 20_000, VIEWPORT, 0)).toEqual(
      EMPTY_SEGMENT_WINDOW
    )
  })

  it('widens the slice by the overscan so ribbons are mounted before they scroll in', () => {
    const tight = visibleSegmentWindow(LONG_DIFF, 5_000, 5_000, VIEWPORT, 0)
    const overscanned = visibleSegmentWindow(LONG_DIFF, 5_000, 5_000, VIEWPORT, 300)
    expect(overscanned.start).toBeLessThan(tight.start)
    expect(overscanned.end).toBeGreaterThan(tight.end)
  })

  it('returns a contiguous range, so the overlay can render a plain slice', () => {
    const window = visibleSegmentWindow(LONG_DIFF, 3_000, 3_050, VIEWPORT, 100)
    const sliced = LONG_DIFF.slice(window.start, window.end)
    expect(sliced.map((s) => s.id)).toEqual(
      Array.from({ length: window.end - window.start }, (_, i) => window.start + i)
    )
  })

  it('is empty when everything sits far above or far below the band', () => {
    expect(visibleSegmentWindow(LONG_DIFF, 500_000, 500_000, VIEWPORT, 0)).toEqual(
      EMPTY_SEGMENT_WINDOW
    )
  })
})

describe('sameSegmentWindow', () => {
  it('compares both bounds', () => {
    expect(sameSegmentWindow({ start: 2, end: 9 }, { start: 2, end: 9 })).toBe(true)
    expect(sameSegmentWindow({ start: 2, end: 9 }, { start: 3, end: 9 })).toBe(false)
    expect(sameSegmentWindow({ start: 2, end: 9 }, { start: 2, end: 10 })).toBe(false)
  })
})
