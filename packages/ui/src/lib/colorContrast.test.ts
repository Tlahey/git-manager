import { describe, it, expect } from 'vitest'
import {
  parseHslTriplet,
  hslToRgb,
  relativeLuminance,
  contrastRatio,
  contrastRatioForHslTriplets,
} from './colorContrast'

describe('parseHslTriplet', () => {
  it('parses a globals.css-style triplet', () => {
    expect(parseHslTriplet('222.2 84% 4.9%')).toEqual({ h: 222.2, s: 84, l: 4.9 })
  })

  it('tolerates surrounding whitespace', () => {
    expect(parseHslTriplet('  0 0% 100%  ')).toEqual({ h: 0, s: 0, l: 100 })
  })

  it('rejects malformed values', () => {
    expect(parseHslTriplet('#ffffff')).toBeNull()
    expect(parseHslTriplet('222 84 4.9')).toBeNull() // missing % signs
    expect(parseHslTriplet('')).toBeNull()
  })
})

describe('hslToRgb', () => {
  it('converts primary colors', () => {
    expect(hslToRgb(0, 0, 0)).toEqual({ r: 0, g: 0, b: 0 }) // black
    expect(hslToRgb(0, 0, 100)).toEqual({ r: 255, g: 255, b: 255 }) // white
    expect(hslToRgb(0, 100, 50)).toEqual({ r: 255, g: 0, b: 0 }) // red
    expect(hslToRgb(120, 100, 50)).toEqual({ r: 0, g: 255, b: 0 }) // green
    expect(hslToRgb(240, 100, 50)).toEqual({ r: 0, g: 0, b: 255 }) // blue
  })
})

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5)
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5)
  })
})

describe('contrastRatio', () => {
  it('is 21:1 for black on white', () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 1)
  })

  it('is 1:1 for identical colors', () => {
    expect(contrastRatio({ r: 120, g: 120, b: 120 }, { r: 120, g: 120, b: 120 })).toBeCloseTo(1, 5)
  })

  it('is order-independent', () => {
    const a = { r: 30, g: 40, b: 50 }
    const b = { r: 200, g: 210, b: 220 }
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10)
  })

  it('flags the classic white-on-yellow failure', () => {
    // White text on a saturated yellow — the exact case we want to catch.
    const white = hslToRgb(0, 0, 100)
    const yellow = hslToRgb(60, 100, 50)
    expect(contrastRatio(white, yellow)).toBeLessThan(4.5)
  })
})

describe('contrastRatioForHslTriplets', () => {
  it('computes contrast from two triplets', () => {
    expect(contrastRatioForHslTriplets('0 0% 0%', '0 0% 100%')).toBeCloseTo(21, 1)
  })

  it('returns null when a triplet is invalid', () => {
    expect(contrastRatioForHslTriplets('#000', '0 0% 100%')).toBeNull()
  })
})
