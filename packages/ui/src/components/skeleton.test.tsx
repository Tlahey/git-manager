import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { createRef } from 'react'
import { Skeleton } from './skeleton'

describe('Skeleton', () => {
  it('renders a pulsing placeholder', () => {
    const { container } = render(<Skeleton data-testid="sk" />)
    const el = container.querySelector('[data-testid="sk"]')!
    expect(el.className).toContain('animate-pulse')
    expect(el.className).toContain('bg-muted')
  })

  it('is hidden from assistive tech (decorative)', () => {
    const { container } = render(<Skeleton />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('merges a custom className for sizing/shape', () => {
    const { container } = render(<Skeleton className="h-4 w-24 rounded-full" />)
    const cls = (container.firstElementChild as HTMLElement).className
    expect(cls).toContain('h-4')
    expect(cls).toContain('w-24')
    expect(cls).toContain('rounded-full')
  })

  it('forwards the ref to the underlying element', () => {
    const ref = createRef<HTMLDivElement>()
    render(<Skeleton ref={ref} />)
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })
})
