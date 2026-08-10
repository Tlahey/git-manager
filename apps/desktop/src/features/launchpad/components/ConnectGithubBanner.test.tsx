import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConnectGithubBanner } from './ConnectGithubBanner'

describe('ConnectGithubBanner', () => {
  it('states what is missing and what the Launchpad would show', () => {
    render(<ConnectGithubBanner />)
    expect(screen.getByText('Connect your GitHub account')).toBeInTheDocument()
    expect(screen.getByText(/pull requests, issues, reviews and contributions/)).toBeInTheDocument()
  })

  it('opens the integration settings from its action', async () => {
    const onOpenSettings = vi.fn()
    const user = userEvent.setup()
    render(<ConnectGithubBanner onOpenSettings={onOpenSettings} />)
    await user.click(screen.getByRole('button', { name: 'Open settings' }))
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })

  it('can be closed once read', async () => {
    const onDismiss = vi.fn()
    const user = userEvent.setup()
    render(<ConnectGithubBanner onOpenSettings={vi.fn()} onDismiss={onDismiss} />)
    await user.click(screen.getByRole('button', { name: 'Hide this message' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  // Each control is optional and independent — a window with no way into Settings still gets the
  // explanation, and a caller with nowhere to record a dismissal gets no dead close button.
  it('omits each control the caller gave no handler for', () => {
    const { rerender } = render(<ConnectGithubBanner />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()

    rerender(<ConnectGithubBanner onDismiss={vi.fn()} />)
    expect(screen.getByTestId('launchpad-connect-github-dismiss')).toBeInTheDocument()
    expect(screen.queryByTestId('launchpad-connect-github-button')).not.toBeInTheDocument()
  })

  // It sits above a tab that still has local content to show, so it must stay one row tall — a
  // centred empty state here pushed the WIP list off screen to explain what was missing.
  it('stays a single non-growing strip', () => {
    render(<ConnectGithubBanner onOpenSettings={vi.fn()} onDismiss={vi.fn()} />)
    const banner = screen.getByTestId('launchpad-connect-github')
    expect(banner).toHaveClass('shrink-0', 'py-1.5', 'items-center')
  })
})
