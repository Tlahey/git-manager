import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SWRConfig } from 'swr'
import type { GitBranch, GitDiff } from '@git-manager/git-types'

const { useBranchesMock } = vi.hoisted(() => ({ useBranchesMock: vi.fn() }))
vi.mock('../../../hooks/useBranches', () => ({ useBranches: () => useBranchesMock() }))
vi.mock('../../../api/git.api', () => ({ apiCompareRefs: vi.fn() }))

// The diff list is virtualized, and jsdom reports a 0px-tall scroll container — see virtualizerMock.
vi.mock('@tanstack/react-virtual', async () =>
  (await import('../../../test/virtualizerMock')).virtualizerModule()
)

import { apiCompareRefs } from '../../../api/git.api'
import { CompareBranchesDialog } from './CompareBranchesDialog'

const mockedCompare = apiCompareRefs as unknown as ReturnType<typeof vi.fn>

function branch(name: string, isRemote = false): GitBranch {
  return {
    name,
    shortName: isRemote ? name.split('/').slice(1).join('/') : name,
    isHead: false,
    isRemote,
    commitOid: `oid-${name}`,
    commitMessage: 'msg',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
  }
}

const DIFF: GitDiff = {
  files: [
    {
      oldPath: 'a.ts',
      newPath: 'a.ts',
      status: 'modified',
      additions: 3,
      deletions: 1,
      hunks: [],
      isBinary: false,
    },
  ],
  totalAdditions: 3,
  totalDeletions: 1,
}

function renderDialog(props: Partial<React.ComponentProps<typeof CompareBranchesDialog>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onChangeRefs = vi.fn()
  const onClose = vi.fn()
  const result = render(
    <QueryClientProvider client={client}>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <CompareBranchesDialog
          repoPath="/repo"
          baseRef="main"
          headRef="feature"
          open
          onChangeRefs={onChangeRefs}
          onClose={onClose}
          {...props}
        />
      </SWRConfig>
    </QueryClientProvider>
  )
  return { ...result, onChangeRefs, onClose }
}

beforeEach(() => {
  vi.clearAllMocks()
  useBranchesMock.mockReturnValue({
    data: [branch('main'), branch('feature'), branch('origin/main', true)],
  })
})

describe('CompareBranchesDialog', () => {
  it('compares the two refs it was opened on and lists the changed files', async () => {
    mockedCompare.mockResolvedValue(DIFF)
    renderDialog()

    expect(screen.getByText('Compare branches')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('a.ts')).toBeInTheDocument())
    expect(mockedCompare).toHaveBeenCalledWith('/repo', 'main', 'feature')
    expect(screen.getByTestId('compare-branches-summary')).toHaveTextContent('1 file changed')
  })

  it('offers every branch by its full name, so a local branch and its remote stay distinct', () => {
    mockedCompare.mockResolvedValue(DIFF)
    renderDialog()
    const base = screen.getByTestId('compare-branches-base')
    expect(Array.from(base.querySelectorAll('option')).map((o) => o.value)).toEqual([
      'main',
      'feature',
      'origin/main',
    ])
  })

  it('keeps a ref the branch list no longer holds selectable', () => {
    mockedCompare.mockResolvedValue(DIFF)
    renderDialog({ baseRef: 'v1.2.0' })
    const base = screen.getByTestId('compare-branches-base')
    expect(Array.from(base.querySelectorAll('option')).map((o) => o.value)).toContain('v1.2.0')
    expect((base as HTMLSelectElement).value).toBe('v1.2.0')
  })

  it('reports a re-picked side to its owner rather than diffing on its own', async () => {
    mockedCompare.mockResolvedValue(DIFF)
    const { onChangeRefs } = renderDialog()
    await userEvent.selectOptions(screen.getByTestId('compare-branches-head'), 'origin/main')
    expect(onChangeRefs).toHaveBeenCalledWith('main', 'origin/main')
  })

  it('swaps the two sides — a different diff, not a cosmetic change', async () => {
    mockedCompare.mockResolvedValue(DIFF)
    const { onChangeRefs } = renderDialog()
    await userEvent.click(screen.getByTestId('compare-branches-swap'))
    expect(onChangeRefs).toHaveBeenCalledWith('feature', 'main')
  })

  it('asks for two different refs instead of diffing one against itself', () => {
    renderDialog({ headRef: 'main' })
    expect(screen.getByText('Pick two different references to compare.')).toBeInTheDocument()
    expect(mockedCompare).not.toHaveBeenCalled()
  })

  it('says so when the two refs have identical contents', async () => {
    mockedCompare.mockResolvedValue({ files: [], totalAdditions: 0, totalDeletions: 0 })
    renderDialog()
    await waitFor(() =>
      expect(screen.getByText('These two references have identical contents.')).toBeInTheDocument()
    )
  })

  it('surfaces a backend failure instead of an endless spinner', async () => {
    mockedCompare.mockRejectedValue(new Error("Ref 'gone' could not be resolved"))
    renderDialog()
    await waitFor(() =>
      expect(screen.getByTestId('compare-branches-error')).toHaveTextContent(
        "Ref 'gone' could not be resolved"
      )
    )
  })

  it('does not fetch while closed', () => {
    renderDialog({ open: false })
    expect(mockedCompare).not.toHaveBeenCalled()
  })

  it('closes on Escape', async () => {
    mockedCompare.mockResolvedValue(DIFF)
    const { onClose } = renderDialog()
    await waitFor(() => expect(screen.getByText('a.ts')).toBeInTheDocument())
    screen
      .getByRole('dialog')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onClose).toHaveBeenCalled()
  })
})
