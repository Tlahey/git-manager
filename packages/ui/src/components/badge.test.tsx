import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge, NumberBadge } from './badge'

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>New</Badge>)
    expect(screen.getByText('New')).toBeInTheDocument()
  })

  it('defaults to the "default" variant styling', () => {
    render(<Badge data-testid="badge">New</Badge>)
    expect(screen.getByTestId('badge').className).toContain('bg-badge')
  })

  it.each([
    ['secondary', 'bg-badge-secondary'],
    ['destructive', 'bg-badge-destructive'],
    ['outline', 'border-input'],
    ['success', 'bg-success/15'],
    ['warning', 'bg-amber-500/15'],
  ] as const)('applies the %s variant classes', (variant, expectedClass) => {
    render(
      <Badge data-testid="badge" variant={variant}>
        Label
      </Badge>
    )
    expect(screen.getByTestId('badge').className).toContain(expectedClass)
  })

  it('merges a custom className alongside variant classes', () => {
    render(
      <Badge data-testid="badge" className="extra-class">
        Label
      </Badge>
    )
    const badge = screen.getByTestId('badge')
    expect(badge.className).toContain('extra-class')
    expect(badge.className).toContain('bg-badge')
  })

  it('forwards arbitrary HTML attributes', () => {
    render(<Badge title="tooltip text">Label</Badge>)
    expect(screen.getByText('Label')).toHaveAttribute('title', 'tooltip text')
  })
})

describe('NumberBadge', () => {
  it('renders the count', () => {
    render(<NumberBadge data-testid="n" count={3} />)
    expect(screen.getByTestId('n')).toHaveTextContent('3')
  })

  it('uses the graded --badge pair so its label stays AA and its fill is graded', () => {
    // Regression guard for the Twilight notification bubble: the count rides the
    // --badge component token (fill + foreground). The theme suite grades both its
    // label (badge pair) AND its fill vs the surface (non-text WCAG 1.4.11), which a
    // raw text-primary-on-tint or bg-primary would escape.
    render(<NumberBadge data-testid="n" count={1} />)
    const el = screen.getByTestId('n')
    expect(el.className).toContain('bg-badge')
    expect(el.className).toContain('text-badge-foreground')
  })

  it('hides itself when the count is 0 or less', () => {
    const { container } = render(<NumberBadge count={0} />)
    expect(container).toBeEmptyDOMElement()
    const { container: negative } = render(<NumberBadge count={-2} />)
    expect(negative).toBeEmptyDOMElement()
  })

  it('still renders 0 when hideZero is false', () => {
    render(<NumberBadge data-testid="n" count={0} hideZero={false} />)
    expect(screen.getByTestId('n')).toHaveTextContent('0')
  })

  it('caps large counts as "max+"', () => {
    render(<NumberBadge data-testid="n" count={150} max={99} />)
    expect(screen.getByTestId('n')).toHaveTextContent('99+')
  })

  it('merges a positioning className from the caller', () => {
    render(<NumberBadge data-testid="n" count={1} className="absolute -top-1" />)
    const el = screen.getByTestId('n')
    expect(el.className).toContain('absolute')
    expect(el.className).toContain('bg-badge')
  })
})
