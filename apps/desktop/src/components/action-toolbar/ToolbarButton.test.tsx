import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToolbarButton } from './ToolbarButton'

describe('ToolbarButton', () => {
  it('renders the label and icon, and calls onClick', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<ToolbarButton icon={<svg data-testid="icon" />} label="Fetch" onClick={onClick} />)
    expect(screen.getByTestId('icon')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Fetch' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('shows a spinner instead of the icon while loading, and disables the button', () => {
    render(<ToolbarButton icon={<svg data-testid="icon" />} label="Fetch" loading />)
    expect(screen.queryByTestId('icon')).not.toBeInTheDocument()
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('is disabled when the disabled prop is set', () => {
    render(<ToolbarButton icon={<svg />} label="Fetch" disabled />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('defaults the title to the label when no title is given', () => {
    render(<ToolbarButton icon={<svg />} label="Fetch" />)
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Fetch')
  })

  it('uses an explicit title over the label when given', () => {
    render(<ToolbarButton icon={<svg />} label="Fetch" title="Fetch from origin" />)
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Fetch from origin')
  })

  it('hides the label on narrow screens by default', () => {
    render(<ToolbarButton icon={<svg />} label="Fetch" />)
    expect(screen.getByText('Fetch').className).toContain('hidden')
  })

  it('keeps the label always visible when hideLabelOnNarrow is false', () => {
    render(<ToolbarButton icon={<svg />} label="Fetch" hideLabelOnNarrow={false} />)
    expect(screen.getByText('Fetch').className).not.toContain('hidden')
  })

  it('renders a numbered badge when badge > 0', () => {
    render(<ToolbarButton icon={<svg />} label="Push" badge={4} />)
    expect(screen.getByTestId('toolbar-button-badge')).toHaveTextContent('4')
  })

  it('caps the badge at 99+', () => {
    render(<ToolbarButton icon={<svg />} label="Push" badge={150} />)
    expect(screen.getByTestId('toolbar-button-badge')).toHaveTextContent('99+')
  })

  it('gives the badge the descriptive title as its accessible label', () => {
    render(<ToolbarButton icon={<svg />} label="Pull" title="2 commits to pull" badge={2} />)
    expect(screen.getByTestId('toolbar-button-badge')).toHaveAttribute(
      'aria-label',
      '2 commits to pull'
    )
  })

  it('renders no badge when badge is 0 or undefined', () => {
    const { rerender } = render(<ToolbarButton icon={<svg />} label="Push" badge={0} />)
    expect(screen.queryByTestId('toolbar-button-badge')).not.toBeInTheDocument()
    rerender(<ToolbarButton icon={<svg />} label="Push" />)
    expect(screen.queryByTestId('toolbar-button-badge')).not.toBeInTheDocument()
  })

  it('hides the badge while loading (spinner takes over)', () => {
    render(<ToolbarButton icon={<svg />} label="Push" badge={4} loading />)
    expect(screen.queryByTestId('toolbar-button-badge')).not.toBeInTheDocument()
  })
})
