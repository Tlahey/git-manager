import { describe, it, expect } from 'vitest'
import {
  getGraphColumnLayout,
  getGraphMaxWidth,
  getMarkerPlacement,
  isGraphCompact,
  laneCenterX,
} from './graphColumnSizing'
import { GRAPH_CELL_TRAILING_MARGIN } from './graphLayout'

// Standard row height everywhere: avatar 32px, COL_WIDTH 22, overlay = 32 + 8 = 40.
const AVATAR = 32

describe('laneCenterX', () => {
  it('centers each lane on the COL_WIDTH grid', () => {
    expect(laneCenterX(0)).toBe(11)
    expect(laneCenterX(3)).toBe(3 * 22 + 11)
  })
})

describe('getGraphMaxWidth', () => {
  it('caps the column at the last lane center + half an avatar + paddings', () => {
    // laneCenterX(3)=77, + 16 avatar radius + 8 right padding + 8 trailing margin = 109
    expect(getGraphMaxWidth(3, AVATAR)).toBe(109)
  })

  it('grows with the avatar size (small vs standard row height)', () => {
    expect(getGraphMaxWidth(3, 24)).toBe(getGraphMaxWidth(3, AVATAR) - 4)
  })
})

describe('getGraphColumnLayout — mode selection', () => {
  it('is `full` when every lane fits (width at the computed max)', () => {
    const layout = getGraphColumnLayout(getGraphMaxWidth(3, AVATAR), 3, AVATAR)
    expect(layout.mode).toBe('full')
    expect(layout.overlayStart).toBe(layout.innerWidth)
    expect(layout.overlayOpacity).toBe(0)
  })

  it('is `full` for a single-lane repo at its small computed max width', () => {
    // needed inner = laneCenterX(0)=11 + 16 avatar radius + 8 right padding = 35 ≤ innerWidth 52
    expect(getGraphColumnLayout(60, 0, AVATAR).mode).toBe('full')
  })

  it('is `overflow` just below the max width', () => {
    const layout = getGraphColumnLayout(getGraphMaxWidth(3, AVATAR) - 1, 3, AVATAR)
    expect(layout.mode).toBe('overflow')
  })

  it('reserves an avatar-wide fade zone on the right in `overflow` mode', () => {
    const layout = getGraphColumnLayout(120, 6, AVATAR)
    expect(layout.mode).toBe('overflow')
    expect(layout.innerWidth).toBe(112)
    expect(layout.overlayStart).toBe(112 - (AVATAR + 8))
  })

  it('grows the zone in progressively from the right over the first missing pixels', () => {
    // getGraphMaxWidth(6, 32) = 175; 12px below → deficit 12 of the 24px growth range.
    const halfway = getGraphColumnLayout(getGraphMaxWidth(6, AVATAR) - 12, 6, AVATAR)
    expect(halfway.mode).toBe('overflow')
    expect(halfway.overlayOpacity).toBe(0.5)
    // Zone half-grown: overlayStart = inner 155 - (40 overlay width × 0.5)
    expect(halfway.overlayStart).toBe(135)
    // Far below the max the zone is fully grown and its shadow fully opaque.
    const grown = getGraphColumnLayout(120, 6, AVATAR)
    expect(grown.overlayOpacity).toBe(1)
    expect(grown.overlayStart).toBe(grown.innerWidth - 40)
  })

  it('is `compact` once no lane fits next to the fade zone', () => {
    // innerWidth - overlayWidth < COL_WIDTH ⇔ width < 22 + 40 + 8 = 70
    expect(getGraphColumnLayout(69, 6, AVATAR).mode).toBe('compact')
    expect(getGraphColumnLayout(70, 6, AVATAR).mode).toBe('overflow')
  })

  it('fades the connection lines out as the column approaches the compact boundary', () => {
    // Wide overflow: lines fully visible.
    expect(getGraphColumnLayout(120, 6, AVATAR).linesOpacity).toBe(1)
    // overlayStart 27 → (27 - 22) / 22 ≈ 0.23
    expect(getGraphColumnLayout(75, 6, AVATAR).linesOpacity).toBe(0.23)
    // Right at the compact boundary the lines are already invisible.
    expect(getGraphColumnLayout(70, 6, AVATAR).linesOpacity).toBe(0)
    expect(getGraphColumnLayout(48, 6, AVATAR).linesOpacity).toBe(0)
    // And full mode never dims them.
    expect(getGraphColumnLayout(getGraphMaxWidth(6, AVATAR), 6, AVATAR).linesOpacity).toBe(1)
  })

  it('exposes the drawable width at the compact minimum', () => {
    const layout = getGraphColumnLayout(48, 6, AVATAR)
    expect(layout.mode).toBe('compact')
    expect(layout.innerWidth).toBe(48 - GRAPH_CELL_TRAILING_MARGIN)
  })

  it('fades the zone back out across the compact range', () => {
    // Just past the boundary the zone is still almost fully opaque…
    expect(getGraphColumnLayout(69, 6, AVATAR).overlayOpacity).toBe(0.95)
    // …and fully gone at the minimum width.
    expect(getGraphColumnLayout(48, 6, AVATAR).overlayOpacity).toBe(0)
  })
})

describe('isGraphCompact', () => {
  it('matches the layout mode boundary', () => {
    expect(isGraphCompact(69, AVATAR)).toBe(true)
    expect(isGraphCompact(70, AVATAR)).toBe(false)
  })

  it('kicks in later for the smaller avatar of the small row height', () => {
    // overlay = 24 + 8 = 32 → boundary at width 22 + 32 + 8 = 62
    expect(isGraphCompact(61, 24)).toBe(true)
    expect(isGraphCompact(62, 24)).toBe(false)
  })
})

describe('getMarkerPlacement', () => {
  it('keeps the natural lane position in `full` mode', () => {
    const layout = getGraphColumnLayout(getGraphMaxWidth(6, AVATAR), 6, AVATAR)
    expect(getMarkerPlacement(4, layout, AVATAR)).toEqual({
      x: laneCenterX(4),
      overflowed: false,
      opacity: 1,
    })
  })

  it('keeps lanes that fit left of the fade zone at their natural position', () => {
    const layout = getGraphColumnLayout(120, 6, AVATAR)
    // laneCenterX(2)=55, +16 = 71 ≤ overlayStart 72 → fits
    expect(getMarkerPlacement(2, layout, AVATAR)).toEqual({ x: 55, overflowed: false, opacity: 1 })
  })

  it('lets a marker travel inside the zone at its natural position, partially dimmed', () => {
    const layout = getGraphColumnLayout(120, 6, AVATAR)
    // laneCenterX(3)=77 hasn't reached the pin (94) yet, but overlaps the zone by 21px:
    // opacity = 1 - 0.55 * 21/32 ≈ 0.64
    expect(getMarkerPlacement(3, layout, AVATAR)).toEqual({ x: 77, overflowed: true, opacity: 0.64 })
  })

  it('pins markers past the zone end shy of the right edge, fully dimmed', () => {
    const layout = getGraphColumnLayout(120, 6, AVATAR)
    // pin = innerWidth 112 - 16 (half avatar) - 6 (gap) = 90
    expect(getMarkerPlacement(5, layout, AVATAR)).toEqual({ x: 90, overflowed: true, opacity: 0.45 })
    expect(getMarkerPlacement(6, layout, AVATAR)).toEqual({ x: 90, overflowed: true, opacity: 0.45 })
  })

  it('centers every marker at full opacity at the compact minimum width', () => {
    const layout = getGraphColumnLayout(48, 6, AVATAR)
    expect(layout.compactBlend).toBe(1)
    const center = layout.innerWidth / 2
    expect(getMarkerPlacement(0, layout, AVATAR)).toEqual({ x: center, overflowed: true, opacity: 1 })
    expect(getMarkerPlacement(6, layout, AVATAR)).toEqual({ x: center, overflowed: true, opacity: 1 })
  })

  it('slides markers toward the center progressively across the compact range', () => {
    // width 55 → inner 47; blend t = (62 - 47) / 22 ≈ 0.68 between the boundary and the minimum.
    const layout = getGraphColumnLayout(55, 6, AVATAR)
    expect(layout.mode).toBe('compact')
    expect(layout.compactBlend).toBeGreaterThan(0)
    expect(layout.compactBlend).toBeLessThan(1)
    // lane 0: part-way between its natural x (11) and the center (23.5), partially re-brightened.
    expect(getMarkerPlacement(0, layout, AVATAR)).toEqual({ x: 19.52, overflowed: true, opacity: 0.89 })
    // Right at the boundary (t = 0) the placement matches the overflow formula exactly.
    const atBoundary = getGraphColumnLayout(70, 6, AVATAR)
    expect(atBoundary.mode).toBe('overflow')
    expect(getMarkerPlacement(0, atBoundary, AVATAR).x).toBe(laneCenterX(0))
  })
})
