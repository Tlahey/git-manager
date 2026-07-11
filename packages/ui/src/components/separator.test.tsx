import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Separator } from './separator'

describe('Separator', () => {
  it('defaults to a horizontal, decorative separator', () => {
    const { container } = render(<Separator data-testid="sep" />)
    const sep = container.querySelector('[data-testid="sep"]')!
    expect(sep).toHaveAttribute('data-orientation', 'horizontal')
    expect(sep.className).toContain('h-[1px]')
    expect(sep.className).toContain('w-full')
    // Decorative separators are hidden from the accessibility tree per the ARIA spec.
    expect(sep).toHaveAttribute('role', 'none')
  })

  it('applies vertical sizing classes when orientation="vertical"', () => {
    const { container } = render(<Separator data-testid="sep" orientation="vertical" />)
    const sep = container.querySelector('[data-testid="sep"]')!
    expect(sep).toHaveAttribute('data-orientation', 'vertical')
    expect(sep.className).toContain('h-full')
    expect(sep.className).toContain('w-[1px]')
  })

  it('exposes a "separator" role when explicitly non-decorative', () => {
    const { container } = render(<Separator data-testid="sep" decorative={false} />)
    expect(container.querySelector('[data-testid="sep"]')).toHaveAttribute('role', 'separator')
  })

  it('merges a custom className', () => {
    const { container } = render(<Separator data-testid="sep" className="my-4" />)
    expect(container.querySelector('[data-testid="sep"]')!.className).toContain('my-4')
  })
})
