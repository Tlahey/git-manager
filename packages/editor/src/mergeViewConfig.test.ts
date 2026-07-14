import { describe, expect, it } from 'vitest'
import {
  COLLAPSE_CONTEXT_LINES,
  COLLAPSED_BANNER_HEIGHT_LINES,
  DEFAULT_LINE_HEIGHT,
  GAP_WIDTH,
  MIN_PANE_PX,
  WAVE_AMPLITUDE,
  WAVE_HALF_PERIOD,
} from './mergeViewConfig'

// A config module has no behavior to exercise — these assertions instead pin the invariants
// other modules silently rely on, so an accidental edit that breaks a relationship (rather than
// just retuning a value) fails loudly here instead of as a subtle rendering glitch.
describe('mergeViewConfig invariants', () => {
  it('keeps line/pane sizes positive', () => {
    expect(DEFAULT_LINE_HEIGHT).toBeGreaterThan(0)
    expect(GAP_WIDTH).toBeGreaterThan(0)
    expect(MIN_PANE_PX).toBeGreaterThan(0)
  })

  it('keeps at least one context line on each side of a collapsed block', () => {
    expect(Number.isInteger(COLLAPSE_CONTEXT_LINES)).toBe(true)
    expect(COLLAPSE_CONTEXT_LINES).toBeGreaterThanOrEqual(1)
  })

  it('sizes the collapsed banner to at least one line', () => {
    expect(COLLAPSED_BANNER_HEIGHT_LINES).toBeGreaterThanOrEqual(1)
  })

  it('keeps the wave amplitude within its half-period so arcs stay well-formed', () => {
    expect(WAVE_AMPLITUDE).toBeGreaterThan(0)
    expect(WAVE_HALF_PERIOD).toBeGreaterThan(0)
    expect(WAVE_AMPLITUDE).toBeLessThanOrEqual(WAVE_HALF_PERIOD)
  })
})
