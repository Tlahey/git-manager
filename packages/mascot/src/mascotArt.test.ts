import { describe, it, expect } from 'vitest'
import {
  MASCOT_VIEWBOX,
  MASCOT_SELECTORS,
  MASCOT_MARKUP,
  MASCOT_STYLES,
  MASCOT_LAYOUT,
} from './mascotArt'
import { PLACEMENTS } from './generated/layout'

const limbZones = PLACEMENTS.filter((p) => p.role !== 'head').map((p) => p.zone)
const headPlacement = PLACEMENTS.find((p) => p.role === 'head')!

describe('MASCOT_LAYOUT', () => {
  it('keys limbs by every non-head placement zone, and only those', () => {
    expect(Object.keys(MASCOT_LAYOUT.limbs).sort()).toEqual([...limbZones].sort())
  })

  it('derives the head from the generated head placement', () => {
    expect(MASCOT_LAYOUT.head.sprite).toBe(headPlacement.sprite)
    expect(MASCOT_LAYOUT.head.x).toBe(headPlacement.x)
    expect(MASCOT_LAYOUT.head.y).toBe(headPlacement.y)
    expect(MASCOT_LAYOUT.head.scale).toBe(headPlacement.scale)
  })

  it('exposes the reference alignment geometry', () => {
    expect(MASCOT_LAYOUT.reference.size).toBeGreaterThan(0)
    expect(MASCOT_LAYOUT.reference.headMaxWidth).toBeGreaterThan(0)
  })

  it('carries each limb spec through from its placement (pivot, animation params)', () => {
    for (const p of PLACEMENTS.filter((p) => p.role !== 'head')) {
      const limb = MASCOT_LAYOUT.limbs[p.zone]
      expect(limb.px).toBe(p.pivot.x)
      expect(limb.py).toBe(p.pivot.y)
      expect(limb.amp).toBe(p.anim.amp)
      expect(limb.dur).toBe(p.anim.dur)
      expect(limb.delay).toBe(p.anim.delay)
      expect(limb.flip).toBe(p.flip || undefined)
    }
  })
})

describe('MASCOT_MARKUP', () => {
  it('roots the SVG with the shared selector class and the declared viewBox', () => {
    expect(MASCOT_MARKUP).toContain(`class="${MASCOT_SELECTORS.root}"`)
    expect(MASCOT_MARKUP).toContain(
      `viewBox="${MASCOT_VIEWBOX.minX} ${MASCOT_VIEWBOX.minY} ${MASCOT_VIEWBOX.width} ${MASCOT_VIEWBOX.height}"`
    )
  })

  it('renders one limb group per non-head placement zone', () => {
    for (const zone of limbZones) {
      expect(MASCOT_MARKUP).toContain(`gm-arm gm-arm--${zone}`)
    }
  })

  it('mirrors flipped limbs (and only those) with a horizontal scale transform', () => {
    for (const p of PLACEMENTS.filter((p) => p.role !== 'head')) {
      const group = MASCOT_MARKUP.match(
        new RegExp(`<g class="gm-arm gm-arm--${p.zone}">[\\s\\S]*?</g>`)
      )![0]
      if (p.flip) {
        expect(group).toContain('scale(-1 1)')
      } else {
        expect(group).not.toContain('scale(-1 1)')
      }
    }
  })

  it('paints every part in the generated placement order, head included', () => {
    const markupIndex = (p: (typeof PLACEMENTS)[number]) =>
      p.role === 'head'
        ? MASCOT_MARKUP.indexOf(p.sprite.uri)
        : MASCOT_MARKUP.indexOf(`gm-arm gm-arm--${p.zone}`)
    const indices = PLACEMENTS.map(markupIndex)
    for (const idx of indices) expect(idx).toBeGreaterThan(-1)
    expect(indices).toEqual([...indices].sort((a, b) => a - b))
  })
})

describe('MASCOT_STYLES', () => {
  it('declares a wave animation rule with the right pivot/amplitude/timing for every limb', () => {
    for (const zone of limbZones) {
      const limb = MASCOT_LAYOUT.limbs[zone]
      expect(MASCOT_STYLES).toContain(
        `.gm-arm--${zone} { --gm-px: ${limb.px}px; --gm-py: ${limb.py}px; --gm-amp: ${limb.amp}; animation: gm-wave ${limb.dur}s ease-in-out infinite ${limb.delay}s; }`
      )
    }
  })

  it('gates continuous motion behind prefers-reduced-motion: no-preference', () => {
    expect(MASCOT_STYLES).toContain('@media (prefers-reduced-motion: no-preference)')
  })

  it('kills every animation in static mode', () => {
    expect(MASCOT_STYLES).toContain(
      `.${MASCOT_SELECTORS.root}[data-static] * { animation: none !important; }`
    )
  })
})
