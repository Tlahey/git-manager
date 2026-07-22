import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../../api/git.api', () => ({ apiRenameBranch: vi.fn() }))

import { apiRenameBranch } from '../../api/git.api'
import { RenameBranchDialog } from './RenameBranchDialog'

const mockedRenameBranch = apiRenameBranch as unknown as ReturnType<typeof vi.fn>

function renderDialog(props: Partial<React.ComponentProps<typeof RenameBranchDialog>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
  const utils = render(
    <QueryClientProvider client={client}>
      <RenameBranchDialog repoPath="/repo" branch="feat" open onClose={vi.fn()} {...props} />
    </QueryClientProvider>
  )
  return { ...utils, invalidateSpy }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RenameBranchDialog — rendering', () => {
  it('shows the title and description, and prefills the input with the current name', () => {
    renderDialog()
    expect(screen.getByText('Rename branch')).toBeInTheDocument()
    expect(screen.getByText('New name for feat')).toBeInTheDocument()
    expect(screen.getByTestId('rename-branch-name-input')).toHaveValue('feat')
  })

  it('disables confirm while the name is unchanged, empty, or whitespace', async () => {
    const user = userEvent.setup()
    renderDialog()
    const confirm = screen.getByRole('button', { name: 'Rename' })
    expect(confirm).toBeDisabled() // unchanged
    const input = screen.getByTestId('rename-branch-name-input')
    await user.clear(input)
    expect(confirm).toBeDisabled() // empty
    await user.type(input, 'better-name')
    expect(confirm).toBeEnabled()
  })
})

describe('RenameBranchDialog — renaming', () => {
  it('renames the branch, invalidates queries, and closes', async () => {
    mockedRenameBranch.mockResolvedValue(undefined)
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { invalidateSpy } = renderDialog({ onClose })

    const input = screen.getByTestId('rename-branch-name-input')
    await user.clear(input)
    await user.type(input, 'better-name{Enter}')

    expect(mockedRenameBranch).toHaveBeenCalledWith('/repo', 'feat', 'better-name')
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['branches', '/repo'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['git-log', '/repo'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['git-status', '/repo'] })
  })

  it('shows an inline error and stays open when the rename fails', async () => {
    mockedRenameBranch.mockRejectedValue(new Error('branch already exists'))
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })

    const input = screen.getByTestId('rename-branch-name-input')
    await user.clear(input)
    await user.type(input, 'better-name')
    await user.click(screen.getByRole('button', { name: 'Rename' }))

    expect(await screen.findByText(/branch already exists/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cancel closes without renaming', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(mockedRenameBranch).not.toHaveBeenCalled()
  })
})
