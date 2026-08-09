import { describe, it, expect } from 'vitest'
import {
  getGraphColumnLayout,
  getGraphMaxWidth,
  getMarkerPlacement,
  graphLeftInset,
  isGraphCompact,
  laneCenterX,
} from './graphColumnSizing'
import { GRAPH_CELL_TRAILING_MARGIN } from './graphLayout'

// Standard row height everywhere: avatar 32px, COL_WIDTH 22, overlay = 32 + 8 = 40.
const AVATAR = 32
// Lane 0's distance to the graph cell's own left edge (COL_WIDTH/2=11) is less than the 16px
// avatar radius, so every lane shifts right by this amount (see graphColumnSizing.ts).
const INSET = graphLeftInset(AVATAR)

describe('laneCenterX', () => {
  it('centers each lane on the COL_WIDTH grid, shifted right by the left inset', () => {
    expect(laneCenterX(0, AVATAR)).toBe(11 + INSET)
    expect(laneCenterX(3, AVATAR)).toBe(3 * 22 + 11 + INSET)
  })
})

describe('getGraphMaxWidth', () => {
  it('caps the column at the last lane center + half an avatar + paddings', () => {
    // laneCenterX(3, AVATAR)=82, + 16 avatar radius + 8 right padding + 8 trailing margin = 114
    expect(getGraphMaxWidth(3, AVATAR)).toBe(114)
  })

  it('grows with the avatar size (small vs standard row height)', () => {
    // The smaller avatar (radius 12) needs only a 1px inset vs 5px at standard height, so the two
    // maxes differ by more than just the 4px radius gap — compute each directly rather than by
    // the difference.
    expect(getGraphMaxWidth(3, 24)).toBe(106)
    expect(getGraphMaxWidth(3, AVATAR)).toBe(114)
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
    // needed inner = laneCenterX(0, AVATAR)=16 + 16 avatar radius + 8 right padding = 40 ≤ innerWidth 52
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
    // getGraphMaxWidth(6, 32) = 180; 12px below → deficit 12 of the 24px growth range.
    const halfway = getGraphColumnLayout(getGraphMaxWidth(6, AVATAR) - 12, 6, AVATAR)
    expect(halfway.mode).toBe('overflow')
    expect(halfway.overlayOpacity).toBe(0.5)
    // Zone half-grown: overlayStart = inner 160 - (40 overlay width × 0.5)
    expect(halfway.overlayStart).toBe(140)
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

describe('getGraphColumnLayout — horizontal scrolling', () => {
  it('does not scroll a column that already shows every lane', () => {
    const layout = getGraphColumnLayout(getGraphMaxWidth(6, AVATAR), 6, AVATAR, 200)
    expect(layout.mode).toBe('full')
    expect(layout.maxScrollX).toBe(0)
    expect(layout.scrollX).toBe(0)
    expect(layout.leftOverlayEnd).toBe(0)
  })

  it('scrolls by exactly the width missing to show every lane', () => {
    // getGraphMaxWidth(6, 32) = 180 → at width 120 the column is 60px short.
    const layout = getGraphColumnLayout(120, 6, AVATAR, 1000)
    expect(layout.maxScrollX).toBe(60)
    expect(layout.scrollX).toBe(60)
    expect(getGraphColumnLayout(120, 6, AVATAR, -10).scrollX).toBe(0)
  })

  it('grows the left zone in with the scroll, and hides it again at rest', () => {
    expect(getGraphColumnLayout(120, 6, AVATAR).leftOverlayEnd).toBe(0)
    // Half the 24px fade range scrolled → half of the 40px zone.
    expect(getGraphColumnLayout(120, 6, AVATAR, 12).leftOverlayEnd).toBe(20)
    expect(getGraphColumnLayout(120, 6, AVATAR, 40).leftOverlayEnd).toBe(40)
  })

  it('recedes the right zone as the scroll consumes the hidden width', () => {
    const rest = getGraphColumnLayout(120, 6, AVATAR)
    expect(rest.overlayOpacity).toBe(1)
    // 60px missing, 43 scrolled → 17 left of the 24px range.
    expect(getGraphColumnLayout(120, 6, AVATAR, 43).overlayOpacity).toBe(0.7083333333333334)
    // Scrolled all the way: nothing is hidden on the right anymore, so the zone is gone.
    const scrolled = getGraphColumnLayout(120, 6, AVATAR, 60)
    expect(scrolled.overlayOpacity).toBe(0)
    expect(scrolled.overlayStart).toBe(scrolled.innerWidth)
  })

  it('pins a marker at lane 0 rather than at the pin gap, so nothing moves at rest', () => {
    expect(getGraphColumnLayout(120, 6, AVATAR).leftPinX).toBe(laneCenterX(0, AVATAR))
  })
})

describe('getMarkerPlacement — horizontal scrolling', () => {
  it('moves every lane left by the scroll offset', () => {
    const layout = getGraphColumnLayout(120, 6, AVATAR, 22)
    // laneCenterX(3, AVATAR)=82 → 60, now just inside the (still mostly grown) zone.
    expect(getMarkerPlacement(3, layout, AVATAR)).toEqual({
      x: 60,
      overflowed: true,
      opacity: 0.93,
    })
  })

  it('brings the last lane fully into view at maximum scroll', () => {
    const layout = getGraphColumnLayout(120, 6, AVATAR, 60)
    // laneCenterX(6, AVATAR)=148 - 60 = 88, i.e. the 8px right padding before innerWidth 112 minus
    // the avatar radius — visible, unpinned and undimmed now that the zone is gone.
    expect(getMarkerPlacement(6, layout, AVATAR)).toEqual({ x: 88, overflowed: false, opacity: 1 })
  })

  it('pins a marker scrolled off the left edge, fully dimmed', () => {
    const layout = getGraphColumnLayout(120, 6, AVATAR, 60)
    // laneCenterX(0, AVATAR)=16 - 60 = -44, i.e. more than an avatar past the pin. Not flagged as
    // overflowed: its band runs away from the left zone and keeps its tint.
    expect(getMarkerPlacement(0, layout, AVATAR)).toEqual({
      x: laneCenterX(0, AVATAR),
      overflowed: false,
      opacity: 0.45,
    })
  })

  it('dims a left-pinned marker progressively with how far it was held back', () => {
    // lane 1 (33) scrolled by 38 → -5, i.e. 16px (half an avatar) short of the pin.
    const layout = getGraphColumnLayout(120, 6, AVATAR, 38)
    expect(getMarkerPlacement(1, layout, AVATAR)).toEqual({
      x: laneCenterX(0, AVATAR),
      overflowed: false,
      opacity: 0.73,
    })
  })

  it('leaves lane 0 alone while the column is not scrolled', () => {
    const layout = getGraphColumnLayout(120, 6, AVATAR)
    expect(getMarkerPlacement(0, layout, AVATAR)).toEqual({
      x: laneCenterX(0, AVATAR),
      overflowed: false,
      opacity: 1,
    })
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
      x: laneCenterX(4, AVATAR),
      overflowed: false,
      opacity: 1,
    })
  })

  it('keeps lanes that fit left of the fade zone at their natural position', () => {
    const layout = getGraphColumnLayout(120, 6, AVATAR)
    // laneCenterX(2, AVATAR)=60, +16 = 76 > overlayStart 72 → already 4px into the zone
    expect(getMarkerPlacement(2, layout, AVATAR)).toEqual({
      x: 60,
      overflowed: true,
      opacity: 0.93,
    })
  })

  it('lets a marker travel inside the zone at its natural position, partially dimmed', () => {
    const layout = getGraphColumnLayout(120, 6, AVATAR)
    // laneCenterX(3, AVATAR)=82 hasn't reached the pin (90) yet, but overlaps the zone by 26px:
    // opacity = 1 - 0.55 * 26/32 ≈ 0.55
    expect(getMarkerPlacement(3, layout, AVATAR)).toEqual({
      x: 82,
      overflowed: true,
      opacity: 0.55,
    })
  })

  it('pins markers past the zone end shy of the right edge, fully dimmed', () => {
    const layout = getGraphColumnLayout(120, 6, AVATAR)
    // pin = innerWidth 112 - 16 (half avatar) - 6 (gap) = 90
    expect(getMarkerPlacement(5, layout, AVATAR)).toEqual({
      x: 90,
      overflowed: true,
      opacity: 0.45,
    })
    expect(getMarkerPlacement(6, layout, AVATAR)).toEqual({
      x: 90,
      overflowed: true,
      opacity: 0.45,
    })
  })

  it('centers every marker at full opacity at the compact minimum width', () => {
    const layout = getGraphColumnLayout(48, 6, AVATAR)
    expect(layout.compactBlend).toBe(1)
    const center = layout.innerWidth / 2
    expect(getMarkerPlacement(0, layout, AVATAR)).toEqual({
      x: center,
      overflowed: true,
      opacity: 1,
    })
    expect(getMarkerPlacement(6, layout, AVATAR)).toEqual({
      x: center,
      overflowed: true,
      opacity: 1,
    })
  })

  it('slides markers toward the center progressively across the compact range', () => {
    // width 55 → inner 47; blend t = (62 - 47) / 22 ≈ 0.68 between the boundary and the minimum.
    const layout = getGraphColumnLayout(55, 6, AVATAR)
    expect(layout.mode).toBe('compact')
    expect(layout.compactBlend).toBeGreaterThan(0)
    expect(layout.compactBlend).toBeLessThan(1)
    // lane 0: part-way between its natural x (16) and the center (23.5), partially re-brightened.
    expect(getMarkerPlacement(0, layout, AVATAR)).toEqual({
      x: 21.11,
      overflowed: true,
      opacity: 0.86,
    })
    // Right at the boundary (t = 0) the placement matches the overflow formula exactly.
    const atBoundary = getGraphColumnLayout(70, 6, AVATAR)
    expect(atBoundary.mode).toBe('overflow')
    expect(getMarkerPlacement(0, atBoundary, AVATAR).x).toBe(laneCenterX(0, AVATAR))
  })
})
