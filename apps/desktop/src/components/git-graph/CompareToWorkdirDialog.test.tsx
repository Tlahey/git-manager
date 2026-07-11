import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }),
}))
vi.mock('../../api/git.api', () => ({ apiCompareCommitToWorkdir: vi.fn() }))

import { apiCompareCommitToWorkdir } from '../../api/git.api'
import { CompareToWorkdirDialog } from './CompareToWorkdirDialog'

const mockedCompare = apiCompareCommitToWorkdir as unknown as ReturnType<typeof vi.fn>

function renderDialog(props: Partial<React.ComponentProps<typeof CompareToWorkdirDialog>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CompareToWorkdirDialog repoPath="/repo" oid="abc123" shortOid="abc123d" open onClose={vi.fn()} {...props} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CompareToWorkdirDialog', () => {
  it('shows a spinner while loading', () => {
    mockedCompare.mockReturnValue(new Promise(() => {}))
    renderDialog()
    expect(screen.getByText('gitTree.contextMenu.compareToWorkdir')).toBeInTheDocument()
    expect(screen.getByText('gitTree.createBranch.from:{"sha":"abc123d"}')).toBeInTheDocument()
  })

  it('shows a "no differences" message once loaded with no files', async () => {
    mockedCompare.mockResolvedValue({ files: [] })
    renderDialog()
    await waitFor(() => expect(screen.getByText('gitTree.contextMenu.noDifferences')).toBeInTheDocument())
  })

  it('renders a DiffViewer for each changed file', async () => {
    mockedCompare.mockResolvedValue({
      files: [
        { oldPath: 'a.ts', newPath: 'a.ts', status: 'modified', isBinary: false, additions: 1, deletions: 0, hunks: [] },
        { oldPath: 'b.ts', newPath: 'b.ts', status: 'added', isBinary: false, additions: 3, deletions: 0, hunks: [] },
      ],
    })
    renderDialog()
    await waitFor(() => expect(screen.getByText('a.ts')).toBeInTheDocument())
    expect(screen.getByText('b.ts')).toBeInTheDocument()
  })

  it('does not fetch while closed', () => {
    renderDialog({ open: false })
    expect(mockedCompare).not.toHaveBeenCalled()
  })

  it('calls onClose when the dialog is dismissed', async () => {
    mockedCompare.mockResolvedValue({ files: [] })
    const onClose = vi.fn()
    renderDialog({ onClose })
    await waitFor(() => expect(screen.getByText('gitTree.contextMenu.noDifferences')).toBeInTheDocument())
    screen.getByRole('dialog').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onClose).toHaveBeenCalled()
  })
})
