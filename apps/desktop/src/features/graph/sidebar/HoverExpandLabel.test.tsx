import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HoverExpandLabel } from './HoverExpandLabel'

function makeOverflow(el: Element, overflowing: boolean) {
  Object.defineProperty(el, 'scrollWidth', { value: overflowing ? 300 : 100, configurable: true })
  Object.defineProperty(el, 'clientWidth', { value: 100, configurable: true })
}

describe('HoverExpandLabel — truncated text', () => {
  it('renders the children in a truncated span', () => {
    render(<HoverExpandLabel>Some long label</HoverExpandLabel>)
    expect(screen.getByText('Some long label')).toHaveClass('truncate')
  })

  it('applies the container class name to the wrapper', () => {
    const { container } = render(
      <HoverExpandLabel containerClassName="my-wrapper">Label</HoverExpandLabel>
    )
    expect(container.firstElementChild).toHaveClass('my-wrapper')
  })

  it('applies className to the truncated span', () => {
    render(<HoverExpandLabel className="font-bold">Label</HoverExpandLabel>)
    expect(screen.getByText('Label')).toHaveClass('font-bold')
  })
})

describe('HoverExpandLabel — overlay on overflow', () => {
  it('does not show an overlay on hover when the text is not actually overflowing', () => {
    const { container } = render(<HoverExpandLabel>Label</HoverExpandLabel>)
    const text = screen.getByText('Label')
    makeOverflow(text, false)
    fireEvent.mouseEnter(container.firstElementChild!)
    expect(screen.getAllByText('Label')).toHaveLength(1)
  })

  it('shows a portal overlay with the same content when the text overflows', () => {
    const { container } = render(<HoverExpandLabel>Long overflowing label</HoverExpandLabel>)
    const text = screen.getByText('Long overflowing label')
    makeOverflow(text, true)
    fireEvent.mouseEnter(container.firstElementChild!)

    const overlays = screen.getAllByText('Long overflowing label')
    expect(overlays).toHaveLength(2) // the truncated span + the portal copy
    expect(document.body.querySelector('.fixed.z-overlay')).toBeTruthy()
  })

  it('hides the overlay on mouse leave', () => {
    const { container } = render(<HoverExpandLabel>Long overflowing label</HoverExpandLabel>)
    const text = screen.getByText('Long overflowing label')
    makeOverflow(text, true)
    fireEvent.mouseEnter(container.firstElementChild!)
    expect(screen.getAllByText('Long overflowing label')).toHaveLength(2)

    fireEvent.mouseLeave(container.firstElementChild!)
    expect(screen.getAllByText('Long overflowing label')).toHaveLength(1)
  })

  it('hides the overlay when the window scrolls while it is shown', () => {
    const { container } = render(<HoverExpandLabel>Long overflowing label</HoverExpandLabel>)
    const text = screen.getByText('Long overflowing label')
    makeOverflow(text, true)
    fireEvent.mouseEnter(container.firstElementChild!)
    expect(screen.getAllByText('Long overflowing label')).toHaveLength(2)

    fireEvent.scroll(window)
    expect(screen.getAllByText('Long overflowing label')).toHaveLength(1)
  })
})
