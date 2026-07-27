import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { LlmIcon } from './llm-icon'

function svgOf(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('no svg rendered')
  return svg
}

describe('LlmIcon', () => {
  /** It sits inline with lucide icons everywhere; a different grid reads as visually foreign. */
  it('is drawn on lucide’s 24×24 grid with a matching stroke', () => {
    const svg = svgOf(render(<LlmIcon />).container)
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
    expect(svg).toHaveAttribute('stroke-width', '2')
    expect(svg).toHaveAttribute('stroke-linecap', 'round')
    expect(svg).toHaveAttribute('stroke-linejoin', 'round')
  })

  it('inherits its colour from the surrounding text', () => {
    expect(svgOf(render(<LlmIcon />).container)).toHaveAttribute('stroke', 'currentColor')
  })

  /** Two shapes, not one: the bubble is what distinguishes it from a bare spark at 14px. */
  it('draws both the bubble and the spark', () => {
    const { container } = render(<LlmIcon />)
    expect(container.querySelectorAll('path')).toHaveLength(2)
  })

  /** A stroked 6px star closes into a blob when scaled down, so the spark is filled. */
  it('fills the spark rather than stroking it', () => {
    const { container } = render(<LlmIcon />)
    const spark = container.querySelectorAll('path')[1]
    expect(spark).toHaveAttribute('fill', 'currentColor')
    expect(spark).toHaveAttribute('stroke', 'none')
  })

  it('merges a caller className with its own', () => {
    const svg = svgOf(render(<LlmIcon className="h-3.5 w-3.5 text-primary" />).container)
    expect(svg).toHaveClass('shrink-0', 'h-3.5', 'w-3.5', 'text-primary')
  })

  /** Decorative by default — the label lives on the button that wraps it. */
  it('is hidden from assistive tech unless the caller names it', () => {
    expect(svgOf(render(<LlmIcon />).container)).toHaveAttribute('aria-hidden', 'true')
  })

  it('lets a caller override the aria attributes and pass arbitrary props', () => {
    const svg = svgOf(
      render(<LlmIcon aria-hidden={false} aria-label="Generate" data-testid="llm" />).container
    )
    expect(svg).toHaveAttribute('aria-hidden', 'false')
    expect(svg).toHaveAttribute('aria-label', 'Generate')
    expect(svg).toHaveAttribute('data-testid', 'llm')
  })
})
