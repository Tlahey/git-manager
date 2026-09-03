import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { toastSuccess, toastError, toastWarning } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
}))
vi.mock('@git-manager/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@git-manager/ui')>()
  return { ...actual, toast: { success: toastSuccess, error: toastError, warning: toastWarning } }
})

vi.mock('../../api/git.api', () => ({
  apiAutosquashPreview: vi.fn(),
  apiRunAutosquash: vi.fn(),
  apiGetRebaseState: vi.fn(),
}))

import { apiAutosquashPreview, apiRunAutosquash, apiGetRebaseState } from '../../api/git.api'
import { useRepoDataStore } from '../../stores/repoData.store'
import { AutosquashPreviewDialog } from './AutosquashPreviewDialog'

const mocked = {
  apiAutosquashPreview: apiAutosquashPreview as unknown as ReturnType<typeof vi.fn>,
  apiRunAutosquash: apiRunAutosquash as unknown as ReturnType<typeof vi.fn>,
  apiGetRebaseState: apiGetRebaseState as unknown as ReturnType<typeof vi.fn>,
}

function renderDialog(props: Partial<{ open: boolean; onClose: () => void }> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AutosquashPreviewDialog
        repoPath="/repo"
        open={props.open ?? true}
        onClose={props.onClose ?? vi.fn()}
      />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocked.apiAutosquashPreview.mockResolvedValue([])
  mocked.apiGetRebaseState.mockResolvedValue({ kind: 'idle' })
  useRepoDataStore.setState({ hiddenFixups: {} })
})

describe('AutosquashPreviewDialog', () => {
  it('shows the group summary and per-group fixups once loaded', async () => {
    mocked.apiAutosquashPreview.mockResolvedValue([
      {
        baseOid: 'base1',
        baseSubject: 'Add feature',
        fixups: [
          { oid: 'sha1-full', shortOid: 'sha1' },
          { oid: 'sha2-full', shortOid: 'sha2' },
        ],
      },
    ])
    renderDialog()
    await waitFor(() => expect(screen.getByText('2 commit(s) will be merged')).toBeInTheDocument())
    expect(screen.getByText('Add feature')).toBeInTheDocument()
    expect(screen.getByText('fixup! sha1')).toBeInTheDocument()
    expect(screen.getByText('fixup! sha2')).toBeInTheDocument()
  })

  it('disables confirm while there are no fixup groups', async () => {
    renderDialog()
    await waitFor(() => expect(screen.getByText('0 commit(s) will be merged')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Apply autosquash' })).toBeDisabled()
  })

  it('enables confirm once groups are present', async () => {
    mocked.apiAutosquashPreview.mockResolvedValue([
      {
        baseOid: 'base1',
        baseSubject: 'Add feature',
        fixups: [{ oid: 'sha1-full', shortOid: 'sha1' }],
      },
    ])
    renderDialog()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Apply autosquash' })).toBeEnabled()
    )
  })

  it('runs the autosquash, invalidates related queries, and toasts success on a clean finish', async () => {
    mocked.apiAutosquashPreview.mockResolvedValue([
      {
        baseOid: 'base1',
        baseSubject: 'Add feature',
        fixups: [{ oid: 'sha1-full', shortOid: 'sha1' }],
      },
    ])
    mocked.apiRunAutosquash.mockResolvedValue(undefined)
    mocked.apiGetRebaseState.mockResolvedValue({ kind: 'idle' })
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Apply autosquash' })).toBeEnabled()
    )

    await user.click(screen.getByRole('button', { name: 'Apply autosquash' }))

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Autosquash completed'))
    expect(mocked.apiRunAutosquash).toHaveBeenCalledWith('/repo', [])
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('toasts a warning (but still closes) when the run pauses on a conflict', async () => {
    mocked.apiAutosquashPreview.mockResolvedValue([
      {
        baseOid: 'base1',
        baseSubject: 'Add feature',
        fixups: [{ oid: 'sha1-full', shortOid: 'sha1' }],
      },
    ])
    mocked.apiRunAutosquash.mockResolvedValue(undefined)
    mocked.apiGetRebaseState.mockResolvedValue({ kind: 'conflict' })
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Apply autosquash' })).toBeEnabled()
    )

    await user.click(screen.getByRole('button', { name: 'Apply autosquash' }))

    await waitFor(() =>
      expect(toastWarning).toHaveBeenCalledWith('Rebase paused — resolve conflicts to continue')
    )
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows an inline error and keeps the dialog open when the run fails', async () => {
    mocked.apiAutosquashPreview.mockResolvedValue([
      {
        baseOid: 'base1',
        baseSubject: 'Add feature',
        fixups: [{ oid: 'sha1-full', shortOid: 'sha1' }],
      },
    ])
    mocked.apiRunAutosquash.mockRejectedValue(new Error('autosquash failed'))
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Apply autosquash' })).toBeEnabled()
    )

    await user.click(screen.getByRole('button', { name: 'Apply autosquash' }))

    await waitFor(() => expect(screen.getByText(/autosquash failed/)).toBeInTheDocument())
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('autosquash failed'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cancel calls onClose without running anything', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(mocked.apiRunAutosquash).not.toHaveBeenCalled()
  })

  it('does not fetch the preview when closed', () => {
    renderDialog({ open: false })
    expect(mocked.apiAutosquashPreview).not.toHaveBeenCalled()
  })

  it('skipping a fixup persists it as hidden and re-fetches the preview excluding it', async () => {
    mocked.apiAutosquashPreview.mockResolvedValue([
      {
        baseOid: 'base1',
        baseSubject: 'Add feature',
        fixups: [{ oid: 'sha1-full', shortOid: 'sha1' }],
      },
    ])
    const user = userEvent.setup()
    renderDialog()
    await waitFor(() => expect(screen.getByText('fixup! sha1')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Ignore this fixup' }))

    expect(toastSuccess).toHaveBeenCalledWith(
      "This fixup won't be suggested again for this repository."
    )
    expect(useRepoDataStore.getState().hiddenFixups['/repo']).toEqual(['sha1-full'])
    await waitFor(() =>
      expect(mocked.apiAutosquashPreview).toHaveBeenLastCalledWith('/repo', ['sha1-full'])
    )
  })
})
