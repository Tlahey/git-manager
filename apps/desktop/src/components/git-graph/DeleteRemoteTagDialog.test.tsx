import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const toastSuccess = vi.fn()
vi.mock('@git-manager/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@git-manager/ui')>()
  return { ...actual, toast: { success: (...a: unknown[]) => toastSuccess(...a), error: vi.fn() } }
})
vi.mock('../../api/git.api', () => ({ apiDeleteRemoteTag: vi.fn() }))

import { apiDeleteRemoteTag } from '../../api/git.api'
import { DeleteRemoteTagDialog } from './DeleteRemoteTagDialog'

const mockedDelete = apiDeleteRemoteTag as unknown as ReturnType<typeof vi.fn>

function renderDialog(props: Partial<React.ComponentProps<typeof DeleteRemoteTagDialog>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
  const utils = render(
    <QueryClientProvider client={client}>
      <DeleteRemoteTagDialog
        repoPath="/repo"
        tagName="v1.0.0"
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

describe('DeleteRemoteTagDialog', () => {
  it('names the tag and remote in the confirmation copy', () => {
    renderDialog()
    expect(screen.getByText('Delete v1.0.0 from origin')).toBeInTheDocument()
    expect(screen.getByText(/on origin for everyone/)).toBeInTheDocument()
  })

  it('deletes the remote tag, invalidates queries, toasts, and closes on confirm', async () => {
    mockedDelete.mockResolvedValue(undefined)
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { invalidateSpy } = renderDialog({ onClose })
    await user.click(screen.getByTestId('delete-remote-tag-confirm'))

    expect(mockedDelete).toHaveBeenCalledWith('/repo', 'v1.0.0', 'origin')
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tags', '/repo'] })
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('shows an inline error and stays open on failure', async () => {
    mockedDelete.mockRejectedValue(new Error('no auth'))
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await user.click(screen.getByTestId('delete-remote-tag-confirm'))

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
