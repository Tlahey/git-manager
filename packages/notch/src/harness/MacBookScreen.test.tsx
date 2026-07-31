import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MacBookScreen, MacBookSurface } from './MacBookScreen'
import { getDevicePreset, NOTCH_DEVICE_PRESETS } from '../notchGeometry'

const mbp14 = getDevicePreset('mbp-14')!
const external = getDevicePreset('external')!

describe('MacBookScreen', () => {
  it('renders the display at the preset point resolution, scaled to fit', () => {
    // The whole point of the harness: children are laid out in *screen points*, so a story can use
    // the coordinates `computeNotchPlacement` returns without converting anything.
    render(<MacBookScreen preset={mbp14} scale={0.5} />)
    const display = screen.getByTestId('macbook-display')
    expect(display).toHaveStyle({ width: `${mbp14.width}px`, height: `${mbp14.height}px` })
    expect(display.style.transform).toBe('scale(0.5)')
  })

  it('draws the camera housing at the preset dimensions', () => {
    render(<MacBookScreen preset={mbp14} />)
    expect(screen.getByTestId('macbook-notch')).toHaveStyle({
      width: `${mbp14.housingWidth}px`,
      height: `${mbp14.safeAreaTop}px`,
    })
  })

  it('draws no housing on a display that has none', () => {
    render(<MacBookScreen preset={external} />)
    expect(screen.queryByTestId('macbook-notch')).not.toBeInTheDocument()
  })

  it('paints the housing over the card, because that is what a real one does', () => {
    // If the harness let the card draw through the notch, it would be useless for the one question
    // it exists to answer: is anything important hidden up there.
    render(
      <MacBookScreen preset={mbp14}>
        <div data-testid="card" />
      </MacBookScreen>
    )
    const display = screen.getByTestId('macbook-display')
    const children = Array.from(display.children)
    expect(children.indexOf(screen.getByTestId('macbook-notch'))).toBeLessThan(
      children.indexOf(screen.getByTestId('card'))
    )
    expect(screen.getByTestId('macbook-notch').className).toContain('z-10')
  })

  it('shows the whole display when no viewport is asked for', () => {
    render(<MacBookScreen preset={mbp14} scale={0.5} />)
    expect(screen.getByTestId('macbook-viewport')).toHaveStyle({
      width: `${mbp14.width * 0.5}px`,
      height: `${mbp14.height * 0.5}px`,
    })
    expect(screen.queryByTestId('macbook-crop-fade')).not.toBeInTheDocument()
  })

  it('crops to the top of the display, so the card can be shown at full size', () => {
    // A whole 14″ display is 982 points tall and the card takes the first 179; at a scale that
    // fits the full screen the notification comes out about a third of its real size.
    render(<MacBookScreen preset={mbp14} scale={1} viewport={{ height: 340 }} />)
    expect(screen.getByTestId('macbook-viewport')).toHaveStyle({ height: '340px' })
    expect(screen.getByTestId('macbook-crop-fade')).toBeInTheDocument()
  })

  it('centres a narrower viewport, so the camera housing stays in frame', () => {
    render(<MacBookScreen preset={mbp14} scale={1} viewport={{ width: 1000 }} />)
    expect(screen.getByTestId('macbook-viewport')).toHaveStyle({ width: '1000px' })
    // The display slides left by half the difference — the notch sits at the display's midpoint.
    expect(screen.getByTestId('macbook-display')).toHaveStyle({
      left: `${-(mbp14.width - 1000) / 2}px`,
    })
  })

  it('never claims to show more than the display actually has', () => {
    render(<MacBookScreen preset={mbp14} scale={1} viewport={{ width: 9000, height: 9000 }} />)
    expect(screen.getByTestId('macbook-viewport')).toHaveStyle({
      width: `${mbp14.width}px`,
      height: `${mbp14.height}px`,
    })
  })

  it('gives the menu bar the preset height', () => {
    render(<MacBookScreen preset={external} />)
    expect(screen.getByTestId('macbook-menu-bar')).toHaveStyle({
      height: `${external.menuBarHeight}px`,
    })
  })

  it('shows a tray icon, so a story can check what the card is anchored under', () => {
    render(<MacBookScreen preset={mbp14} />)
    expect(screen.getByTestId('macbook-tray-icon')).toBeInTheDocument()
  })

  it('keeps its own chrome out of the accessibility tree', () => {
    render(<MacBookScreen preset={mbp14} />)
    expect(screen.getByTestId('macbook-menu-bar')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByTestId('macbook-notch')).toHaveAttribute('aria-hidden', 'true')
  })

  it('tags itself with the device it is standing in for', () => {
    render(<MacBookScreen preset={mbp14} />)
    expect(screen.getByTestId('macbook-screen')).toHaveAttribute('data-device', 'mbp-14')
  })

  it('renders every shipped preset without a housing wider than its own display', () => {
    for (const preset of NOTCH_DEVICE_PRESETS) {
      expect(preset.housingWidth).toBeLessThan(preset.width)
      expect(preset.safeAreaTop).toBeLessThanOrEqual(preset.menuBarHeight)
    }
  })
})

describe('MacBookSurface', () => {
  it('starts hidden at the top, the way the real window is created invisible', () => {
    render(
      <MacBookSurface x={536} width={440} height={179}>
        <div />
      </MacBookSurface>
    )
    const surface = screen.getByTestId('macbook-surface')
    expect(surface.style.visibility).toBe('hidden')
    expect(surface).toHaveStyle({ left: '536px', width: '440px', height: '179px' })
  })

  it('hands its element back, so a host can move it', () => {
    let element: HTMLElement | null = null
    render(
      <MacBookSurface x={0} width={440} height={179} surfaceRef={(el) => (element = el)}>
        <div />
      </MacBookSurface>
    )
    expect(element).toBeInstanceOf(HTMLDivElement)
  })
})
