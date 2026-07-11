import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InnerTab } from './InnerTab'

describe('InnerTab', () => {
  it('renders children and calls onClick', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<InnerTab active={false} onClick={onClick}>Open</InnerTab>)
    await user.click(screen.getByText('Open'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('applies active styling', () => {
    render(<InnerTab active onClick={vi.fn()}>Open</InnerTab>)
    expect(screen.getByText('Open').closest('button')).toHaveClass('border-primary')
  })

  it('shows the count badge when given', () => {
    render(<InnerTab active={false} onClick={vi.fn()} count={5}>Open</InnerTab>)
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('hides the count badge when not given', () => {
    render(<InnerTab active={false} onClick={vi.fn()}>Open</InnerTab>)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('shows a loading skeleton instead of the count while loading', () => {
    render(<InnerTab active={false} onClick={vi.fn()} count={5} loading>Open</InnerTab>)
    expect(screen.queryByText('5')).not.toBeInTheDocument()
  })
})
