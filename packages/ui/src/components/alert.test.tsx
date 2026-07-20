import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { Alert } from './alert'

describe('Alert', () => {
  it('renders its content', () => {
    render(<Alert>Something went wrong</Alert>)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('defaults to the destructive variant tokens', () => {
    const { container } = render(<Alert>Error</Alert>)
    const el = container.firstElementChild as HTMLElement
    expect(el.className).toContain('bg-destructive/10')
    expect(el.className).toContain('text-tone-danger')
  })

  it('applies each variant’s graded tone tokens', () => {
    const { container, rerender } = render(<Alert variant="success">ok</Alert>)
    expect((container.firstElementChild as HTMLElement).className).toContain('text-tone-success')
    rerender(<Alert variant="warning">warn</Alert>)
    expect((container.firstElementChild as HTMLElement).className).toContain('text-tone-warning')
    rerender(<Alert variant="info">info</Alert>)
    expect((container.firstElementChild as HTMLElement).className).toContain('text-tone-info')
  })

  it('never hard-codes a raw palette text colour (uses graded tone tokens)', () => {
    const { container } = render(<Alert variant="warning">warn</Alert>)
    const cls = (container.firstElementChild as HTMLElement).className
    expect(cls).not.toMatch(/\btext-amber-\d/)
    expect(cls).not.toMatch(/\btext-red-\d/)
    expect(cls).not.toMatch(/\btext-emerald-\d/)
  })

  it('renders a leading icon marked decorative', () => {
    render(<Alert icon={<svg data-testid="icon" />}>msg</Alert>)
    const icon = screen.getByTestId('icon')
    expect(icon).toBeInTheDocument()
    expect(icon.parentElement).toHaveAttribute('aria-hidden', 'true')
  })

  it('forwards extra props like role for dynamic messages', () => {
    render(<Alert role="alert">Boom</Alert>)
    expect(screen.getByRole('alert')).toHaveTextContent('Boom')
  })

  it('merges a custom className and forwards the ref', () => {
    const ref = createRef<HTMLDivElement>()
    const { container } = render(
      <Alert ref={ref} className="extra-class">
        x
      </Alert>
    )
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
    expect((container.firstElementChild as HTMLElement).className).toContain('extra-class')
  })
})
