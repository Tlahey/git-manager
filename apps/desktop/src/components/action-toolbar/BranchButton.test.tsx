import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }),
}))

import { BranchButton } from './BranchButton'

async function openPopover(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTitle('toolbar.createBranch'))
}

describe('BranchButton', () => {
  it('is closed by default', () => {
    render(<BranchButton fromRef="main" onCreate={vi.fn()} />)
    expect(screen.queryByPlaceholderText('toolbar.branchNamePlaceholder')).not.toBeInTheDocument()
  })

  it('opens the popover and shows the from-ref hint', async () => {
    const user = userEvent.setup()
    render(<BranchButton fromRef="main" onCreate={vi.fn()} />)
    await openPopover(user)
    expect(screen.getByText('toolbar.fromHead:{"ref":"main"}')).toBeInTheDocument()
  })

  it('disables the create button until a name is entered', async () => {
    const user = userEvent.setup()
    render(<BranchButton fromRef="main" onCreate={vi.fn()} />)
    await openPopover(user)
    expect(screen.getByRole('button', { name: /toolbar.create/ })).toBeDisabled()
    await user.type(screen.getByPlaceholderText('toolbar.branchNamePlaceholder'), 'feature-x')
    expect(screen.getByRole('button', { name: /toolbar.create/ })).toBeEnabled()
  })

  it('submits the trimmed name, then clears and closes on success', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<BranchButton fromRef="main" onCreate={onCreate} />)
    await openPopover(user)
    await user.type(screen.getByPlaceholderText('toolbar.branchNamePlaceholder'), '  feature-x  ')
    await user.click(screen.getByRole('button', { name: /toolbar.create/ }))

    expect(onCreate).toHaveBeenCalledWith('feature-x')
    expect(screen.queryByPlaceholderText('toolbar.branchNamePlaceholder')).not.toBeInTheDocument()
  })

  it('cancel closes the popover without creating a branch', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(<BranchButton fromRef="main" onCreate={onCreate} />)
    await openPopover(user)
    await user.type(screen.getByPlaceholderText('toolbar.branchNamePlaceholder'), 'feature-x')
    await user.click(screen.getByRole('button', { name: 'toolbar.cancel' }))

    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.queryByPlaceholderText('toolbar.branchNamePlaceholder')).not.toBeInTheDocument()
  })

  it('shows a spinner and disables the button while creating', async () => {
    const user = userEvent.setup()
    let resolveCreate!: () => void
    const onCreate = vi.fn(() => new Promise<void>((resolve) => (resolveCreate = resolve)))
    render(<BranchButton fromRef="main" onCreate={onCreate} />)
    await openPopover(user)
    await user.type(screen.getByPlaceholderText('toolbar.branchNamePlaceholder'), 'feature-x')
    await user.click(screen.getByRole('button', { name: /toolbar.create/ }))

    expect(screen.getByRole('button', { name: /toolbar.create/ })).toBeDisabled()
    resolveCreate()
  })
})
