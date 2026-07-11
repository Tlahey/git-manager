import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Spinner } from './spinner'

describe('Spinner', () => {
  it('renders an animated svg with the spin class', () => {
    const { container } = render(<Spinner />)
    const svg = container.querySelector('svg')!
    expect(svg).toBeInTheDocument()
    expect(svg.getAttribute('class')).toContain('animate-spin')
  })

  it('merges a custom className alongside the spin animation', () => {
    const { container } = render(<Spinner className="h-4 w-4" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('class')).toContain('animate-spin')
    expect(svg.getAttribute('class')).toContain('h-4')
  })

  it('renders the track circle and the spinning arc path', () => {
    const { container } = render(<Spinner />)
    expect(container.querySelector('circle')).toBeInTheDocument()
    expect(container.querySelector('path')).toBeInTheDocument()
  })
})
