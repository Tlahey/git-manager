import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../../api/git.api', () => ({ apiCompareCommitToWorkdir: vi.fn() }))

// The diff list is virtualized, and jsdom reports a 0px-tall scroll container — see virtualizerMock.
vi.mock('@tanstack/react-virtual', async () =>
  (await import('../../test/virtualizerMock')).virtualizerModule()
)

import { apiCompareCommitToWorkdir } from '../../api/git.api'
import { CompareToWorkdirDialog } from './CompareToWorkdirDialog'

const mockedCompare = apiCompareCommitToWorkdir as unknown as ReturnType<typeof vi.fn>

function renderDialog(props: Partial<React.ComponentProps<typeof CompareToWorkdirDialog>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CompareToWorkdirDialog
        repoPath="/repo"
        oid="abc123"
        shortOid="abc123d"
        open
        onClose={vi.fn()}
        {...props}
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

describe('CompareToWorkdirDialog', () => {
  it('names the commit it is comparing while the diff loads', () => {
    mockedCompare.mockReturnValue(new Promise(() => {}))
    renderDialog()
    expect(screen.getByText('Compare commit against working directory')).toBeInTheDocument()
    expect(screen.getByText('From commit abc123d')).toBeInTheDocument()
    expect(screen.getByTestId('diff-files-loading')).toBeInTheDocument()
  })

  it('shows a "no differences" message once loaded with no files', async () => {
    mockedCompare.mockResolvedValue({ files: [] })
    renderDialog()
    await waitFor(() =>
      expect(screen.getByText('No differences with the working directory')).toBeInTheDocument()
    )
  })

  it('renders an entry for each changed file', async () => {
    mockedCompare.mockResolvedValue({
      files: [
        {
          oldPath: 'a.ts',
          newPath: 'a.ts',
          status: 'modified',
          isBinary: false,
          additions: 1,
          deletions: 0,
          hunks: [],
        },
        {
          oldPath: 'b.ts',
          newPath: 'b.ts',
          status: 'added',
          isBinary: false,
          additions: 3,
          deletions: 0,
          hunks: [],
        },
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
    await waitFor(() =>
      expect(screen.getByText('No differences with the working directory')).toBeInTheDocument()
    )
    screen
      .getByRole('dialog')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onClose).toHaveBeenCalled()
  })
})
