import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StashConfirmDialog } from './StashConfirmDialog'

function renderDialog(overrides: Partial<Parameters<typeof StashConfirmDialog>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    title: 'Stash changes to switch branch',
    description: 'Your changes must be stashed first.',
    cancelLabel: 'Cancel',
    confirmLabel: 'Stash and switch branch',
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
    testId: 'stash-dialog',
    confirmTestId: 'stash-confirm',
    ...overrides,
  }
  render(<StashConfirmDialog {...props} />)
  return props
}

describe('StashConfirmDialog', () => {
  it('renders the title, description and both labels', () => {
    renderDialog()
    expect(screen.getByTestId('stash-dialog')).toBeInTheDocument()
    expect(screen.getByText('Stash changes to switch branch')).toBeInTheDocument()
    expect(screen.getByText('Your changes must be stashed first.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByTestId('stash-confirm')).toHaveTextContent('Stash and switch branch')
  })

  it('renders nothing when closed', () => {
    renderDialog({ open: false })
    expect(screen.queryByTestId('stash-dialog')).not.toBeInTheDocument()
  })

  it('calls onConfirm and onCancel from their buttons', async () => {
    const user = userEvent.setup()
    const props = renderDialog()

    await user.click(screen.getByTestId('stash-confirm'))
    expect(props.onConfirm).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(props.onCancel).toHaveBeenCalledTimes(1)
  })

  it('disables both buttons while pending', () => {
    renderDialog({ pending: true })
    expect(screen.getByTestId('stash-confirm')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })
})
