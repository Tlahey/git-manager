import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))

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
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AutosquashPreviewDialog', () => {
  it('shows the group summary and per-group fixups once loaded', async () => {
    mocked.apiAutosquashPreview.mockResolvedValue([
      { baseOid: 'base1', baseSubject: 'Add feature', fixups: ['sha1', 'sha2'] },
    ])
    renderDialog()
    await waitFor(() =>
      expect(screen.getByText('fixup.autosquash.summary:{"count":2}')).toBeInTheDocument()
    )
    expect(screen.getByText('Add feature')).toBeInTheDocument()
    expect(screen.getByText('fixup! sha1')).toBeInTheDocument()
    expect(screen.getByText('fixup! sha2')).toBeInTheDocument()
  })

  it('disables confirm while there are no fixup groups', async () => {
    renderDialog()
    await waitFor(() =>
      expect(screen.getByText('fixup.autosquash.summary:{"count":0}')).toBeInTheDocument()
    )
    expect(screen.getByRole('button', { name: 'fixup.autosquash.confirm' })).toBeDisabled()
  })

  it('enables confirm once groups are present', async () => {
    mocked.apiAutosquashPreview.mockResolvedValue([
      { baseOid: 'base1', baseSubject: 'Add feature', fixups: ['sha1'] },
    ])
    renderDialog()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'fixup.autosquash.confirm' })).toBeEnabled()
    )
  })

  it('runs the autosquash, invalidates related queries, and toasts success on a clean finish', async () => {
    mocked.apiAutosquashPreview.mockResolvedValue([
      { baseOid: 'base1', baseSubject: 'Add feature', fixups: ['sha1'] },
    ])
    mocked.apiRunAutosquash.mockResolvedValue(undefined)
    mocked.apiGetRebaseState.mockResolvedValue({ kind: 'idle' })
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'fixup.autosquash.confirm' })).toBeEnabled()
    )

    await user.click(screen.getByRole('button', { name: 'fixup.autosquash.confirm' }))

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('fixup.autosquash.success'))
    expect(mocked.apiRunAutosquash).toHaveBeenCalledWith('/repo')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('toasts a warning (but still closes) when the run pauses on a conflict', async () => {
    mocked.apiAutosquashPreview.mockResolvedValue([
      { baseOid: 'base1', baseSubject: 'Add feature', fixups: ['sha1'] },
    ])
    mocked.apiRunAutosquash.mockResolvedValue(undefined)
    mocked.apiGetRebaseState.mockResolvedValue({ kind: 'conflict' })
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'fixup.autosquash.confirm' })).toBeEnabled()
    )

    await user.click(screen.getByRole('button', { name: 'fixup.autosquash.confirm' }))

    await waitFor(() =>
      expect(toastWarning).toHaveBeenCalledWith('gitTree.contextMenu.rebaseConflict')
    )
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows an inline error and keeps the dialog open when the run fails', async () => {
    mocked.apiAutosquashPreview.mockResolvedValue([
      { baseOid: 'base1', baseSubject: 'Add feature', fixups: ['sha1'] },
    ])
    mocked.apiRunAutosquash.mockRejectedValue(new Error('autosquash failed'))
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'fixup.autosquash.confirm' })).toBeEnabled()
    )

    await user.click(screen.getByRole('button', { name: 'fixup.autosquash.confirm' }))

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
})
