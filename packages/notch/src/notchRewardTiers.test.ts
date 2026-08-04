import { describe, it, expect } from 'vitest'
import { NOTCH_TIER_CONFETTI, NOTCH_TIER_RGB, tierAlpha, tierColor } from './notchRewardTiers'
import type { NotchRewardTier } from './types'

const TIERS: NotchRewardTier[] = ['bronze', 'silver', 'gold', 'platinum']

/** `'255, 215, 0'` → `'#ffd700'`, so a triple and a hex palette can be compared. */
function hexOf(triple: string): string {
  const channels = triple.split(',').map((part) => Number(part.trim()))
  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

describe('NOTCH_TIER_RGB', () => {
  it('covers every tier', () => {
    expect(Object.keys(NOTCH_TIER_RGB).sort()).toEqual([...TIERS].sort())
  })

  it('stores bare triples, so a keyframe can vary their alpha', () => {
    // A hex value cannot be given an alpha from inside a keyframe, which is the whole reason these
    // are not hexes — same constraint as `NOTCH_TONE_RGB`.
    for (const tier of TIERS) {
      expect(NOTCH_TIER_RGB[tier]).toMatch(/^\d{1,3}, \d{1,3}, \d{1,3}$/)
    }
  })

  it('gives each tier its own colour', () => {
    expect(new Set(Object.values(NOTCH_TIER_RGB)).size).toBe(TIERS.length)
  })
})

describe('tierColor / tierAlpha', () => {
  it('builds a plain colour for the medal glyph', () => {
    expect(tierColor('gold')).toBe('rgb(255, 215, 0)')
  })

  it('builds a translucent one for the ring and the glow', () => {
    expect(tierAlpha('gold', 0.45)).toBe('rgba(255, 215, 0, 0.45)')
  })
})

describe('NOTCH_TIER_CONFETTI', () => {
  it('covers every tier', () => {
    expect(Object.keys(NOTCH_TIER_CONFETTI).sort()).toEqual([...TIERS].sort())
  })

  it('never throws a burst in a single colour', () => {
    // One hue reads as a spill rather than as a celebration.
    for (const tier of TIERS) {
      const palette = NOTCH_TIER_CONFETTI[tier]
      expect(palette.length).toBeGreaterThanOrEqual(3)
      expect(new Set(palette).size).toBe(palette.length)
    }
  })

  it('leads with the medal’s own colour, so a bronze burst still looks bronze', () => {
    for (const tier of TIERS) {
      expect(NOTCH_TIER_CONFETTI[tier][0]).toBe(hexOf(NOTCH_TIER_RGB[tier]))
    }
  })

  it('mixes white into every palette, which is what keeps it from reading as one hue', () => {
    for (const tier of TIERS) {
      expect(NOTCH_TIER_CONFETTI[tier]).toContain('#ffffff')
    }
  })
})
