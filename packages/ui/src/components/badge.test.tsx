import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from './badge'

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>New</Badge>)
    expect(screen.getByText('New')).toBeInTheDocument()
  })

  it('defaults to the "default" variant styling', () => {
    render(<Badge data-testid="badge">New</Badge>)
    expect(screen.getByTestId('badge').className).toContain('bg-primary')
  })

  it.each([
    ['secondary', 'bg-secondary'],
    ['destructive', 'bg-destructive'],
    ['outline', 'border-input'],
    ['success', 'bg-green-500/20'],
    ['warning', 'bg-orange-500/20'],
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
    expect(badge.className).toContain('bg-primary')
  })

  it('forwards arbitrary HTML attributes', () => {
    render(<Badge title="tooltip text">Label</Badge>)
    expect(screen.getByText('Label')).toHaveAttribute('title', 'tooltip text')
  })
})
