import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }),
}))
vi.mock('../../api/git.api', () => ({ apiGetCommitsBetween: vi.fn(), apiResetToCommit: vi.fn() }))

import { apiGetCommitsBetween, apiResetToCommit } from '../../api/git.api'
import { ResetDialog } from './ResetDialog'

const mockedCommitsBetween = apiGetCommitsBetween as unknown as ReturnType<typeof vi.fn>
const mockedResetToCommit = apiResetToCommit as unknown as ReturnType<typeof vi.fn>

function renderDialog(props: Partial<React.ComponentProps<typeof ResetDialog>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ResetDialog
        repoPath="/repo"
        targetOid="target1"
        targetSubject="Add feature"
        open
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        {...props}
      />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedCommitsBetween.mockResolvedValue([{ oid: 'a', shortOid: 'a1234', subject: 'Commit A' }])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ResetDialog — commits list', () => {
  it('shows the affected commit count and list once loaded', async () => {
    renderDialog()
    await waitFor(() => expect(screen.getByText('rollback.reset.commitsAffected:{"count":1}')).toBeInTheDocument())
    expect(screen.getByText('Commit A')).toBeInTheDocument()
  })
})

describe('ResetDialog — mode selection', () => {
  it('defaults to "mixed"', () => {
    renderDialog()
    expect(screen.getByRole('radio', { name: 'rollback.reset.mixed' })).toBeChecked()
  })

  it('respects a custom initialMode', () => {
    renderDialog({ initialMode: 'soft' })
    expect(screen.getByRole('radio', { name: 'rollback.reset.soft' })).toBeChecked()
  })

  it('does not show the hard-reset warning/confirm field outside hard mode', () => {
    renderDialog()
    expect(screen.queryByPlaceholderText('rollback.reset.hardConfirmPlaceholder')).not.toBeInTheDocument()
  })

  it('shows the hard-reset warning and confirm field once hard is selected', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('radio', { name: 'rollback.reset.hard' }))
    expect(screen.getByText('rollback.reset.hardWarning')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('rollback.reset.hardConfirmPlaceholder')).toBeInTheDocument()
  })
})

describe('ResetDialog — confirmation gating', () => {
  it('enables confirm immediately for soft/mixed resets', () => {
    renderDialog({ initialMode: 'mixed' })
    expect(screen.getByRole('button', { name: 'rollback.reset.confirm' })).toBeEnabled()
  })

  it('disables confirm for hard reset until "RESET" is typed exactly', async () => {
    const user = userEvent.setup()
    renderDialog({ initialMode: 'hard' })
    const confirmButton = screen.getByRole('button', { name: 'rollback.reset.confirm' })
    expect(confirmButton).toBeDisabled()

    await user.type(screen.getByPlaceholderText('rollback.reset.hardConfirmPlaceholder'), 'reset')
    expect(confirmButton).toBeDisabled()

    await user.clear(screen.getByPlaceholderText('rollback.reset.hardConfirmPlaceholder'))
    await user.type(screen.getByPlaceholderText('rollback.reset.hardConfirmPlaceholder'), 'RESET')
    expect(confirmButton).toBeEnabled()
  })

  it('disables confirm entirely on a protected branch, regardless of mode', () => {
    renderDialog({ protectedBranches: ['main'], currentBranch: 'main' })
    expect(screen.getByText('rollback.protected.branch:{"branch":"main"}')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'rollback.reset.confirm' })).toBeDisabled()
  })
})

describe('ResetDialog — confirming the reset', () => {
  it('resets to the target commit in the selected mode, invalidates queries, and closes', async () => {
    mockedResetToCommit.mockResolvedValue(undefined)
    const onSuccess = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ initialMode: 'soft', onSuccess, onClose })

    await user.click(screen.getByRole('button', { name: 'rollback.reset.confirm' }))

    expect(mockedResetToCommit).toHaveBeenCalledWith('/repo', 'target1', 'soft')
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce())
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('performs a hard reset once "RESET" is typed', async () => {
    mockedResetToCommit.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderDialog({ initialMode: 'hard' })
    await user.type(screen.getByPlaceholderText('rollback.reset.hardConfirmPlaceholder'), 'RESET')
    await user.click(screen.getByRole('button', { name: 'rollback.reset.confirm' }))
    expect(mockedResetToCommit).toHaveBeenCalledWith('/repo', 'target1', 'hard')
  })

  it('shows an inline error and stays open on failure', async () => {
    mockedResetToCommit.mockRejectedValue(new Error('reset failed'))
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ initialMode: 'mixed', onClose })
    await user.click(screen.getByRole('button', { name: 'rollback.reset.confirm' }))

    expect(await screen.findByText(/reset failed/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cancel calls onClose without resetting', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(mockedResetToCommit).not.toHaveBeenCalled()
  })
})
