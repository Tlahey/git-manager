import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }),
}))
vi.mock('../../api/git.api', () => ({ apiRevertCommit: vi.fn() }))

import { apiRevertCommit } from '../../api/git.api'
import { RevertDialog } from './RevertDialog'

const mockedRevert = apiRevertCommit as unknown as ReturnType<typeof vi.fn>

function renderDialog(props: Partial<{ onClose: () => void; onSuccess: (sha: string) => void }> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RevertDialog
        repoPath="/repo"
        commitOid="abc123"
        commitSubject="Add feature"
        open
        onClose={props.onClose ?? vi.fn()}
        onSuccess={props.onSuccess ?? vi.fn()}
      />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RevertDialog', () => {
  it('shows the commit subject in the title', () => {
    renderDialog()
    expect(screen.getByText('rollback.revert.title:{"message":"Add feature"}')).toBeInTheDocument()
  })

  it('reverts with noCommit=false by default', async () => {
    mockedRevert.mockResolvedValue('newsha')
    const onSuccess = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onSuccess, onClose })
    await user.click(screen.getByRole('button', { name: 'rollback.revert.confirm' }))

    expect(mockedRevert).toHaveBeenCalledWith('/repo', 'abc123', false)
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('newsha'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('reverts with noCommit=true when the checkbox is checked', async () => {
    mockedRevert.mockResolvedValue('newsha')
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByLabelText('rollback.revert.noCommit'))
    await user.click(screen.getByRole('button', { name: 'rollback.revert.confirm' }))
    expect(mockedRevert).toHaveBeenCalledWith('/repo', 'abc123', true)
  })

  it('shows an inline error and does not close on failure', async () => {
    mockedRevert.mockRejectedValue(new Error('revert conflict'))
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await user.click(screen.getByRole('button', { name: 'rollback.revert.confirm' }))

    expect(await screen.findByText(/revert conflict/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cancel calls onClose without reverting', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(mockedRevert).not.toHaveBeenCalled()
  })
})
