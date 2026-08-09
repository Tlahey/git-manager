import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../../../api/git.api', () => ({ apiGetCommitDiff: vi.fn() }))

// The diff list is virtualized, and jsdom reports a 0px-tall scroll container — see virtualizerMock.
vi.mock('@tanstack/react-virtual', async () =>
  (await import('../../../test/virtualizerMock')).virtualizerModule()
)

import { apiGetCommitDiff } from '../../../api/git.api'
import { CompareToParentDialog } from './CompareToParentDialog'

const mockedDiff = apiGetCommitDiff as unknown as ReturnType<typeof vi.fn>

function renderDialog(props: Partial<React.ComponentProps<typeof CompareToParentDialog>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CompareToParentDialog
        repoPath="/repo"
        oid="abc123"
        shortOid="abc123d"
        parentNumber={2}
        parentShortOid="bbb2222"
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

describe('CompareToParentDialog', () => {
  it('names the parent it is comparing against', () => {
    mockedDiff.mockReturnValue(new Promise(() => {}))
    renderDialog()
    expect(screen.getByText('Compare against parent 2')).toBeInTheDocument()
    expect(
      screen.getByText('What abc123d changed compared with parent 2 (bbb2222)')
    ).toBeInTheDocument()
  })

  it('turns the 1-based parent number into the backend 0-based index', async () => {
    mockedDiff.mockResolvedValue({ files: [] })
    renderDialog({ parentNumber: 1 })
    await waitFor(() => expect(mockedDiff).toHaveBeenCalledWith('/repo', 'abc123', 0))
  })

  it('asks for the second parent when that is the one picked', async () => {
    mockedDiff.mockResolvedValue({ files: [] })
    renderDialog({ parentNumber: 2 })
    await waitFor(() => expect(mockedDiff).toHaveBeenCalledWith('/repo', 'abc123', 1))
  })

  it('says the merge brought nothing from that side when the diff is empty', async () => {
    mockedDiff.mockResolvedValue({ files: [] })
    renderDialog()
    await waitFor(() =>
      expect(screen.getByText('No differences with this parent')).toBeInTheDocument()
    )
  })

  it('renders one diff per changed file', async () => {
    mockedDiff.mockResolvedValue({
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
      ],
    })
    renderDialog()
    await waitFor(() => expect(screen.getByText('a.ts')).toBeInTheDocument())
  })

  it('does not fetch while closed', () => {
    renderDialog({ open: false })
    expect(mockedDiff).not.toHaveBeenCalled()
  })

  it('calls onClose when the dialog is dismissed', async () => {
    mockedDiff.mockResolvedValue({ files: [] })
    const onClose = vi.fn()
    renderDialog({ onClose })
    await waitFor(() =>
      expect(screen.getByText('No differences with this parent')).toBeInTheDocument()
    )
    screen
      .getByRole('dialog')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onClose).toHaveBeenCalled()
  })
})
