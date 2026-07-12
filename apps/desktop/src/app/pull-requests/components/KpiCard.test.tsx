import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KpiCard } from './KpiCard'

describe('KpiCard', () => {
  it('shows the icon, label, and value', () => {
    render(<KpiCard icon={<span data-testid="icon" />} label="Open PRs" value={12} />)
    expect(screen.getByTestId('icon')).toBeInTheDocument()
    expect(screen.getByText('Open PRs')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('shows the subtitle only when given', () => {
    const { rerender } = render(<KpiCard icon={null} label="L" value={1} />)
    expect(screen.queryByText('vs last week')).not.toBeInTheDocument()

    rerender(<KpiCard icon={null} label="L" value={1} sub="vs last week" />)
    expect(screen.getByText('vs last week')).toBeInTheDocument()
  })

  it('shows a loading skeleton instead of the value while loading', () => {
    render(<KpiCard icon={null} label="L" value={42} loading />)
    expect(screen.queryByText('42')).not.toBeInTheDocument()
  })

  it('applies the accent class to the card', () => {
    const { container } = render(
      <KpiCard icon={null} label="L" value={1} accent="border-red-500" />
    )
    expect(container.firstElementChild).toHaveClass('border-red-500')
  })
})
