import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../../api/git.api', () => ({ apiRevertCommit: vi.fn() }))

import { apiRevertCommit } from '../../api/git.api'
import { RevertDialog, type RevertParent } from './RevertDialog'

const mockedRevert = apiRevertCommit as unknown as ReturnType<typeof vi.fn>

const MERGE_PARENTS: RevertParent[] = [
  { oid: 'p1oid', shortOid: 'aaa1111', subject: 'Release 1.2' },
  { oid: 'p2oid', shortOid: 'bbb2222', subject: 'Add the login form' },
]

function renderDialog(
  props: Partial<{
    onClose: () => void
    onSuccess: (sha: string) => void
    parents: RevertParent[]
  }> = {}
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RevertDialog
        repoPath="/repo"
        commitOid="abc123"
        commitSubject="Add feature"
        parents={props.parents}
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

describe('RevertDialog — ordinary commit', () => {
  it('shows the commit subject in the title', () => {
    renderDialog()
    expect(screen.getByText('Revert "Add feature"')).toBeInTheDocument()
  })

  it('reverts with noCommit=false and no mainline by default', async () => {
    mockedRevert.mockResolvedValue('newsha')
    const onSuccess = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onSuccess, onClose })
    await user.click(screen.getByRole('button', { name: 'Confirm revert' }))

    expect(mockedRevert).toHaveBeenCalledWith('/repo', 'abc123', false, undefined)
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('newsha'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('reverts with noCommit=true when the checkbox is checked', async () => {
    mockedRevert.mockResolvedValue('newsha')
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByLabelText('Stage changes only (do not commit automatically)'))
    await user.click(screen.getByRole('button', { name: 'Confirm revert' }))
    expect(mockedRevert).toHaveBeenCalledWith('/repo', 'abc123', true, undefined)
  })

  it('offers no mainline picker', () => {
    renderDialog({ parents: [{ oid: 'p1', shortOid: 'aaa1111', subject: 'Previous' }] })
    expect(screen.queryByTestId('revert-mainline-picker')).not.toBeInTheDocument()
    expect(
      screen.getByText('This will create a new commit that undoes these changes.')
    ).toBeInTheDocument()
  })

  it('shows an inline error and does not close on failure', async () => {
    mockedRevert.mockRejectedValue(new Error('revert conflict'))
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await user.click(screen.getByRole('button', { name: 'Confirm revert' }))

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

describe('RevertDialog — merge commit', () => {
  it('lists every parent, naming its sha and subject', () => {
    renderDialog({ parents: MERGE_PARENTS })
    expect(screen.getByTestId('revert-mainline-picker')).toBeInTheDocument()
    expect(screen.getByText(/Parent 1 — aaa1111 Release 1\.2/)).toBeInTheDocument()
    expect(screen.getByText(/Parent 2 — bbb2222 Add the login form/)).toBeInTheDocument()
  })

  it('reverts against the first parent unless another is picked', async () => {
    mockedRevert.mockResolvedValue('newsha')
    const user = userEvent.setup()
    renderDialog({ parents: MERGE_PARENTS })
    await user.click(screen.getByRole('button', { name: 'Confirm revert' }))
    expect(mockedRevert).toHaveBeenCalledWith('/repo', 'abc123', false, 1)
  })

  it('sends the picked parent as the mainline', async () => {
    mockedRevert.mockResolvedValue('newsha')
    const user = userEvent.setup()
    renderDialog({ parents: MERGE_PARENTS })
    await user.click(screen.getByTestId('revert-mainline-option-2'))
    await user.click(screen.getByRole('button', { name: 'Confirm revert' }))
    expect(mockedRevert).toHaveBeenCalledWith('/repo', 'abc123', false, 2)
  })

  it('explains what reverting a merge means instead of the ordinary description', () => {
    renderDialog({ parents: MERGE_PARENTS })
    expect(
      screen.queryByText('This will create a new commit that undoes these changes.')
    ).not.toBeInTheDocument()
    expect(screen.getByText(/merge commit/i)).toBeInTheDocument()
  })
})
