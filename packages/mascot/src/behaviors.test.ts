import { describe, it, expect, vi, afterEach } from 'vitest'
import { attachEyeTracking } from './behaviors'
import { MASCOT_SELECTORS } from './mascotArt'

function makeSvg(pupilCount = 2): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement
  Object.defineProperty(svg, 'viewBox', {
    configurable: true,
    value: { baseVal: { x: 0, y: 0, width: 100, height: 100 } },
  })
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON() {} }) as DOMRect

  for (let i = 0; i < pupilCount; i++) {
    const pupil = document.createElementNS('http://www.w3.org/2000/svg', 'circle') as SVGGraphicsElement
    pupil.setAttribute('class', MASCOT_SELECTORS.pupil)
    pupil.dataset.cx = '50'
    pupil.dataset.cy = '50'
    svg.appendChild(pupil)
  }
  document.body.appendChild(svg)
  return svg
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('attachEyeTracking', () => {
  it('is a no-op (returns a no-op cleanup) when the SVG has no pupils', () => {
    const svg = makeSvg(0)
    const cleanup = attachEyeTracking(svg)
    expect(() => cleanup()).not.toThrow()
  })

  it('is a no-op when the user prefers reduced motion', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    const svg = makeSvg()
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    attachEyeTracking(svg)
    expect(addEventListenerSpy).not.toHaveBeenCalledWith('pointermove', expect.anything(), expect.anything())
  })

  it('moves pupils toward the pointer, clamped to the max offset, and marks the svg as tracking', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    const svg = makeSvg()
    attachEyeTracking(svg)

    // Pointer far to the bottom-right of the pupil's rest position (50, 50 in SVG space).
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 100, clientY: 100 }))

    expect(svg.getAttribute('data-tracking')).toBe('')
    const pupil = svg.querySelector(`.${MASCOT_SELECTORS.pupil}`) as SVGGraphicsElement
    expect(pupil.style.transform).toMatch(/^translate\(-?\d+(\.\d+)?px, -?\d+(\.\d+)?px\)$/)

    // The offset must be clamped to MAX_PUPIL_OFFSET (9), even though the raw pointer delta is huge.
    const match = pupil.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/)!
    const [, dx, dy] = match
    const magnitude = Math.hypot(Number(dx), Number(dy))
    expect(magnitude).toBeCloseTo(9, 5)
  })

  it('resets pupils and removes data-tracking when the pointer leaves the window', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    const svg = makeSvg()
    attachEyeTracking(svg)
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 60, clientY: 60 }))
    expect(svg.getAttribute('data-tracking')).toBe('')

    const leaveEvent = new MouseEvent('mouseout', { relatedTarget: null })
    document.dispatchEvent(leaveEvent)

    expect(svg.hasAttribute('data-tracking')).toBe(false)
    const pupil = svg.querySelector(`.${MASCOT_SELECTORS.pupil}`) as SVGGraphicsElement
    expect(pupil.style.transform).toBe('')
  })

  it('does not reset on mouseout between child elements (relatedTarget present)', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    const svg = makeSvg()
    attachEyeTracking(svg)
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 60, clientY: 60 }))

    const child = document.createElement('div')
    document.body.appendChild(child)
    document.dispatchEvent(new MouseEvent('mouseout', { relatedTarget: child }))

    expect(svg.getAttribute('data-tracking')).toBe('')
  })

  it('resets on window blur', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    const svg = makeSvg()
    attachEyeTracking(svg)
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 60, clientY: 60 }))
    window.dispatchEvent(new Event('blur'))
    expect(svg.hasAttribute('data-tracking')).toBe(false)
  })

  it('the returned cleanup function removes listeners and resets state', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    const svg = makeSvg()
    const cleanup = attachEyeTracking(svg)
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 60, clientY: 60 }))
    expect(svg.getAttribute('data-tracking')).toBe('')

    cleanup()
    expect(svg.hasAttribute('data-tracking')).toBe(false)

    // After cleanup, further pointer movement should no longer re-engage tracking.
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 20, clientY: 20 }))
    expect(svg.hasAttribute('data-tracking')).toBe(false)
  })
})
