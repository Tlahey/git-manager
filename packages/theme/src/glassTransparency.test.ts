import { describe, it, expect } from 'vitest'
import {
  clampGlassTransparency,
  glassAlphasForLevel,
  glassTransparencyVars,
  GLASS_TRANSPARENCY_VARS,
  DEFAULT_GLASS_TRANSPARENCY,
} from './glassTransparency'

describe('clampGlassTransparency', () => {
  it('keeps a valid level untouched', () => {
    expect(clampGlassTransparency(42)).toBe(42)
  })

  it('clamps out-of-range values onto the 0–100 scale', () => {
    expect(clampGlassTransparency(-20)).toBe(0)
    expect(clampGlassTransparency(180)).toBe(100)
  })

  it('rounds fractional levels', () => {
    expect(clampGlassTransparency(42.6)).toBe(43)
  })

  // The level comes out of persisted settings, which a user can hand-edit.
  it('falls back to the default for a non-finite value', () => {
    expect(clampGlassTransparency(Number.NaN)).toBe(DEFAULT_GLASS_TRANSPARENCY)
    expect(clampGlassTransparency(Number.POSITIVE_INFINITY)).toBe(DEFAULT_GLASS_TRANSPARENCY)
  })
})

describe('glassAlphasForLevel', () => {
  it('is fully opaque at level 0', () => {
    const { panel, content } = glassAlphasForLevel(0)
    expect(panel).toBe(1)
    expect(content).toBe(1)
  })

  it('sits halfway at level 50', () => {
    expect(glassAlphasForLevel(50)).toEqual({ panel: 0.5, chrome: 0.5, content: 0.5 })
  })

  it('decreases monotonically as the level rises', () => {
    const levels = [0, 25, 50, 75, 100].map(glassAlphasForLevel)
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i].panel).toBeLessThan(levels[i - 1].panel)
      expect(levels[i].chrome).toBeLessThan(levels[i - 1].chrome)
      expect(levels[i].content).toBeLessThan(levels[i - 1].content)
    }
  })

  // The three surfaces travel together, so the top of the scale is genuinely
  // transparent. An earlier version held the content back, which capped the slider
  // short of transparent and made it look like the setting did nothing.
  it('reaches full transparency on every surface at level 100', () => {
    expect(glassAlphasForLevel(100)).toEqual({ panel: 0, chrome: 0, content: 0 })
  })

  it('reaches full opacity on every surface at level 0', () => {
    expect(glassAlphasForLevel(0)).toEqual({ panel: 1, chrome: 1, content: 1 })
  })

  it('never produces an alpha outside 0–1', () => {
    for (const level of [-50, 0, 50, 100, 250]) {
      for (const alpha of Object.values(glassAlphasForLevel(level))) {
        expect(alpha).toBeGreaterThanOrEqual(0)
        expect(alpha).toBeLessThanOrEqual(1)
      }
    }
  })

  it('clamps rather than extrapolating past the ends of the scale', () => {
    expect(glassAlphasForLevel(-30)).toEqual(glassAlphasForLevel(0))
    expect(glassAlphasForLevel(300)).toEqual(glassAlphasForLevel(100))
  })
})

describe('glassTransparencyVars', () => {
  it('emits exactly the custom properties the module owns', () => {
    expect(Object.keys(glassTransparencyVars(50)).sort()).toEqual([...GLASS_TRANSPARENCY_VARS].sort())
  })

  it('emits values the CSS alpha syntax accepts', () => {
    for (const value of Object.values(glassTransparencyVars(70))) {
      expect(value).toMatch(/^[01](\.\d+)?$/)
    }
  })
})
