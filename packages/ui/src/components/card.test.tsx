import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { Card } from './card'

describe('Card', () => {
  it('renders its children', () => {
    render(<Card>panel body</Card>)
    expect(screen.getByText('panel body')).toBeInTheDocument()
  })

  it('applies the card surface tokens and a default radius', () => {
    const { container } = render(<Card>x</Card>)
    const cls = (container.firstElementChild as HTMLElement).className
    expect(cls).toContain('border-border')
    expect(cls).toContain('bg-card')
    expect(cls).toContain('text-card-foreground')
    expect(cls).toContain('rounded-lg')
  })

  it('lets className win over the base (opacity / radius / padding)', () => {
    const { container } = render(<Card className="rounded-xl bg-card/30 p-4">x</Card>)
    const cls = (container.firstElementChild as HTMLElement).className
    expect(cls).toContain('rounded-xl')
    expect(cls).toContain('bg-card/30')
    expect(cls).toContain('p-4')
    // tailwind-merge drops the conflicting base radius / opaque fill
    expect(cls).not.toMatch(/(^|\s)rounded-lg(\s|$)/)
  })

  it('forwards extra props and the ref', () => {
    const ref = createRef<HTMLDivElement>()
    render(
      <Card ref={ref} data-testid="c" role="group">
        x
      </Card>
    )
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
    expect(screen.getByTestId('c')).toHaveAttribute('role', 'group')
  })
})
