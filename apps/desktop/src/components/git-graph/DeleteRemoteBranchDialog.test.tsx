import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const toastSuccess = vi.fn()
vi.mock('@git-manager/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@git-manager/ui')>()
  return { ...actual, toast: { success: (...a: unknown[]) => toastSuccess(...a), error: vi.fn() } }
})
vi.mock('../../api/git.api', () => ({ apiDeleteRemoteBranch: vi.fn() }))

import { apiDeleteRemoteBranch } from '../../api/git.api'
import { DeleteRemoteBranchDialog } from './DeleteRemoteBranchDialog'

const mockedDelete = apiDeleteRemoteBranch as unknown as ReturnType<typeof vi.fn>

function renderDialog(props: Partial<React.ComponentProps<typeof DeleteRemoteBranchDialog>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
  const utils = render(
    <QueryClientProvider client={client}>
      <DeleteRemoteBranchDialog
        repoPath="/repo"
        branchName="feature/x"
        remote="origin"
        open
        onClose={vi.fn()}
        {...props}
      />
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

describe('DeleteRemoteBranchDialog', () => {
  it('names the branch and remote in the confirmation copy', () => {
    renderDialog()
    expect(screen.getByText('Delete feature/x from origin')).toBeInTheDocument()
    expect(screen.getByText(/on origin for everyone/)).toBeInTheDocument()
  })

  it('deletes the remote branch, invalidates queries, toasts, and closes on confirm', async () => {
    mockedDelete.mockResolvedValue(undefined)
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { invalidateSpy } = renderDialog({ onClose })
    await user.click(screen.getByTestId('delete-remote-branch-confirm'))

    expect(mockedDelete).toHaveBeenCalledWith('/repo', 'feature/x', 'origin')
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['branches', '/repo'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['git-log', '/repo'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['git-status', '/repo'] })
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('shows an inline error and stays open on failure', async () => {
    mockedDelete.mockRejectedValue(new Error('no auth'))
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await user.click(screen.getByTestId('delete-remote-branch-confirm'))

    expect(await screen.findByText(/no auth/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cancel closes without deleting', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(mockedDelete).not.toHaveBeenCalled()
  })
})
