import { describe, it, expect, beforeEach } from 'vitest'
import { checkGraphicalContrast, parseCssColor, effectiveBackground } from './graphicalContrast'

// Builds a `<wrapper><ground/><mark/></wrapper>` in the document and returns the
// wrapper, mirroring how Checkbox/Switch/RadioGroup lay out their ground + graphic.
function control({
  groundBg,
  markBg,
  markColor,
  markOpacity,
}: {
  groundBg: string
  markBg?: string
  markColor?: string
  markOpacity?: string
}): HTMLElement {
  const wrapper = document.createElement('span')
  const ground = document.createElement('span')
  ground.setAttribute('data-contrast-ground', '')
  ground.style.backgroundColor = groundBg
  const mark = document.createElement('span')
  mark.setAttribute('data-contrast-mark', 'test-mark')
  if (markBg) mark.style.backgroundColor = markBg
  if (markColor) mark.style.color = markColor
  if (markOpacity !== undefined) mark.style.opacity = markOpacity
  wrapper.append(ground, mark)
  document.body.append(wrapper)
  return wrapper
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('parseCssColor', () => {
  it('parses rgb() and rgba() forms', () => {
    expect(parseCssColor('rgb(12, 34, 56)')).toEqual({ r: 12, g: 34, b: 56, a: 1 })
    expect(parseCssColor('rgba(1, 2, 3, 0.5)')).toEqual({ r: 1, g: 2, b: 3, a: 0.5 })
  })
  it('parses the space/slash form and transparent', () => {
    expect(parseCssColor('rgb(10 20 30 / 0.4)')).toEqual({ r: 10, g: 20, b: 30, a: 0.4 })
    expect(parseCssColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 })
  })
  it('returns null for unparseable input', () => {
    expect(parseCssColor('')).toBeNull()
    expect(parseCssColor('not-a-color')).toBeNull()
  })
})

describe('effectiveBackground', () => {
  it('resolves an opaque background through a transparent child', () => {
    const wrap = document.createElement('div')
    wrap.style.backgroundColor = 'rgb(255, 255, 255)'
    const child = document.createElement('div') // no background
    wrap.append(child)
    document.body.append(wrap)
    expect(effectiveBackground(child)).toEqual({ r: 255, g: 255, b: 255 })
  })
})

describe('checkGraphicalContrast', () => {
  it('passes a high-contrast mark (black on white)', () => {
    control({ groundBg: 'rgb(255, 255, 255)', markBg: 'rgb(0, 0, 0)' })
    expect(checkGraphicalContrast(document.body)).toEqual([])
  })

  it('flags a low-contrast fill (light grey on white, ~1.2:1)', () => {
    control({ groundBg: 'rgb(255, 255, 255)', markBg: 'rgb(230, 230, 230)' })
    const violations = checkGraphicalContrast(document.body)
    expect(violations).toHaveLength(1)
    expect(violations[0].rule).toBe('graphical-contrast')
    expect(violations[0].message).toContain('WCAG 1.4.11')
  })

  it('reproduces the original bug: dark thumb on a dark track', () => {
    // Near-black thumb (old bg-background) on a dark muted track — the exact regression
    // that a text-only a11y run let through.
    control({ groundBg: 'rgb(40, 40, 46)', markBg: 'rgb(20, 20, 24)' })
    expect(checkGraphicalContrast(document.body)).toHaveLength(1)
  })

  it('grades a glyph by its text color when it has no background', () => {
    // A light-grey tick on white → fails; a black tick on white → passes.
    control({ groundBg: 'rgb(255, 255, 255)', markColor: 'rgb(220, 220, 220)' })
    expect(checkGraphicalContrast(document.body)).toHaveLength(1)
    document.body.innerHTML = ''
    control({ groundBg: 'rgb(255, 255, 255)', markColor: 'rgb(0, 0, 0)' })
    expect(checkGraphicalContrast(document.body)).toEqual([])
  })

  it('skips invisible marks (opacity 0) so hidden states never false-positive', () => {
    control({ groundBg: 'rgb(255, 255, 255)', markBg: 'rgb(250, 250, 250)', markOpacity: '0' })
    expect(checkGraphicalContrast(document.body)).toEqual([])
  })

  it('ignores markup that has not opted in', () => {
    const div = document.createElement('div')
    div.innerHTML = '<span style="background-color: rgb(250,250,250)"></span>'
    document.body.append(div)
    expect(checkGraphicalContrast(document.body)).toEqual([])
  })
})
