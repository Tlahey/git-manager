import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { partStyle, referenceFrame, Stage, ReferenceOverlay, MASCOT_LAYOUT } from './rigUtils'

describe('partStyle', () => {
  it('computes left/top/width and a plain rotate transform when not flipped', () => {
    const style = partStyle({ x: 10, y: 20, scale: 2, rot: 45 }, 100)
    expect(style).toEqual({
      position: 'absolute',
      left: 10,
      top: 20,
      width: 200,
      transformOrigin: '0 0',
      transform: 'rotate(45deg)',
    })
  })

  it('prefixes a horizontal flip before the rotation when flip is true', () => {
    const style = partStyle({ x: 5, y: 5, scale: 1, rot: 0, flip: true }, 50)
    expect(style).toEqual({
      position: 'absolute',
      left: 5,
      top: 5,
      width: 50,
      transformOrigin: '0 0',
      transform: 'scale(-1,1) rotate(0deg)',
    })
  })
})

describe('referenceFrame', () => {
  it('aligns the reference image crown to the head sprite crown, per MASCOT_LAYOUT', () => {
    const { head, reference } = MASCOT_LAYOUT
    const k = head.sprite.w / reference.headMaxWidth
    const crownX = head.x + (head.sprite.w * head.scale) / 2
    const expected = {
      left: crownX - reference.crown.x * k,
      top: head.y - reference.crown.y * k,
      width: reference.size * k,
    }

    const result = referenceFrame()

    expect(result.left).toBeCloseTo(expected.left, 6)
    expect(result.top).toBeCloseTo(expected.top, 6)
    expect(result.width).toBeCloseTo(expected.width, 6)
  })
})

describe('Stage', () => {
  it('scales the stage viewport to the requested width and renders children inside it', () => {
    const { container } = render(
      <Stage width={500}>
        <span data-testid="child">hi</span>
      </Stage>
    )

    const viewport = container.firstChild as HTMLElement
    const expectedHeight = (MASCOT_LAYOUT.stage.height * 500) / MASCOT_LAYOUT.stage.width
    expect(viewport.style.width).toBe('500px')
    expect(viewport.style.height).toBe(`${expectedHeight}px`)
    expect(viewport.style.overflow).toBe('hidden')

    const scaledLayer = viewport.firstChild as HTMLElement
    expect(scaledLayer.style.transform).toBe(`scale(${500 / MASCOT_LAYOUT.stage.width})`)
    expect(scaledLayer.style.width).toBe(`${MASCOT_LAYOUT.stage.width}px`)
    expect(scaledLayer.style.height).toBe(`${MASCOT_LAYOUT.stage.height}px`)
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('defaults to a width of 700 and the documented background color', () => {
    const { container } = render(<Stage>{null}</Stage>)
    const viewport = container.firstChild as HTMLElement
    expect(viewport.style.width).toBe('700px')
    expect(viewport.style.background).toContain('10, 24, 48')
  })

  it('accepts a custom background color', () => {
    const { container } = render(<Stage background="#ffffff">{null}</Stage>)
    const viewport = container.firstChild as HTMLElement
    expect(viewport.style.background).toContain('255, 255, 255')
  })
})

describe('ReferenceOverlay', () => {
  it('renders nothing when opacity is zero or negative', () => {
    const { container: zero } = render(<ReferenceOverlay opacity={0} />)
    expect(zero).toBeEmptyDOMElement()

    const { container: negative } = render(<ReferenceOverlay opacity={-0.2} />)
    expect(negative).toBeEmptyDOMElement()
  })

  it('renders the reference image positioned via referenceFrame with the given opacity and blend mode', () => {
    render(<ReferenceOverlay opacity={0.5} blend="multiply" />)
    const img = screen.getByAltText('brand reference') as HTMLImageElement
    const frame = referenceFrame()
    expect(img.style.left).toBe(`${frame.left}px`)
    expect(img.style.top).toBe(`${frame.top}px`)
    expect(img.style.width).toBe(`${frame.width}px`)
    expect(img.style.opacity).toBe('0.5')
    expect(img.style.mixBlendMode).toBe('multiply')
    expect(img.style.pointerEvents).toBe('none')
  })

  it('defaults blend mode to normal', () => {
    render(<ReferenceOverlay opacity={1} />)
    const img = screen.getByAltText('brand reference') as HTMLImageElement
    expect(img.style.mixBlendMode).toBe('normal')
  })
})
