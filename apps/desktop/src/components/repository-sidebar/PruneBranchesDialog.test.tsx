import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { GitBranch } from '@git-manager/git-types'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))
vi.mock('../../api/git.api', () => ({ apiDeleteBranch: vi.fn(), apiFetchRemote: vi.fn() }))
vi.mock('../../api/worktree.api', () => ({ apiGoneUpstreamBranches: vi.fn() }))

import { apiDeleteBranch, apiFetchRemote } from '../../api/git.api'
import { apiGoneUpstreamBranches } from '../../api/worktree.api'
import { PruneBranchesDialog } from './PruneBranchesDialog'

const mockedDeleteBranch = apiDeleteBranch as unknown as ReturnType<typeof vi.fn>
const mockedFetchRemote = apiFetchRemote as unknown as ReturnType<typeof vi.fn>
const mockedGone = apiGoneUpstreamBranches as unknown as ReturnType<typeof vi.fn>

function branch(overrides: Partial<GitBranch> = {}): GitBranch {
  return {
    name: 'refs/heads/feature/x',
    shortName: 'feature/x',
    isHead: false,
    isRemote: false,
    commitOid: 'oid-x-1234567',
    commitMessage: '',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
    ...overrides,
  }
}

function renderDialog(props: Partial<React.ComponentProps<typeof PruneBranchesDialog>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
  const utils = render(
    <QueryClientProvider client={client}>
      <PruneBranchesDialog
        repoPath="/repo"
        branches={[branch()]}
        worktreeBranches={[]}
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
  mockedFetchRemote.mockResolvedValue({ remote: 'origin', updatedRefs: [] })
  mockedGone.mockResolvedValue([])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PruneBranchesDialog — prunable selection', () => {
  it('lists only gone-upstream branches, excluding HEAD, main/master, and worktree-checked-out ones', async () => {
    mockedGone.mockResolvedValue(['feature/gone', 'main', 'feature/head', 'feature/wt'])
    const branches = [
      branch({ shortName: 'feature/gone' }),
      branch({ shortName: 'main' }), // protected
      branch({ shortName: 'feature/head', isHead: true }), // current
      branch({ shortName: 'feature/wt' }), // checked out in a worktree
      branch({ shortName: 'feature/live' }), // upstream not gone
    ]
    renderDialog({ branches, worktreeBranches: ['feature/wt'] })

    await waitFor(() =>
      expect(screen.getByTestId('branch-prune-item-feature/gone')).toBeInTheDocument()
    )
    expect(screen.queryByTestId('branch-prune-item-main')).not.toBeInTheDocument()
    expect(screen.queryByTestId('branch-prune-item-feature/head')).not.toBeInTheDocument()
    expect(screen.queryByTestId('branch-prune-item-feature/wt')).not.toBeInTheDocument()
    expect(screen.queryByTestId('branch-prune-item-feature/live')).not.toBeInTheDocument()
    expect(screen.getByTestId('branch-prune-confirm-button')).toBeEnabled()
  })

  it('shows the empty state and disables confirm when no branch has a gone upstream', async () => {
    mockedGone.mockResolvedValue([])
    renderDialog()
    await waitFor(() =>
      expect(screen.getByText('branch.pruneEmpty')).toBeInTheDocument()
    )
    expect(screen.getByTestId('branch-prune-confirm-button')).toBeDisabled()
  })

  it('runs a fetch --prune on open, before reading the gone-upstream branches', async () => {
    mockedGone.mockResolvedValue(['feature/gone'])
    renderDialog({ branches: [branch({ shortName: 'feature/gone' })] })
    await waitFor(() =>
      expect(screen.getByTestId('branch-prune-item-feature/gone')).toBeInTheDocument()
    )
    expect(mockedFetchRemote).toHaveBeenCalledWith('/repo', undefined, true)
  })

  it('degrades to already-pruned branches with a hint when the fetch fails (offline)', async () => {
    mockedFetchRemote.mockRejectedValue(new Error('offline'))
    mockedGone.mockResolvedValue(['feature/gone'])
    renderDialog({ branches: [branch({ shortName: 'feature/gone' })] })
    await waitFor(() =>
      expect(screen.getByTestId('branch-prune-fetch-failed-hint')).toBeInTheDocument()
    )
    // The already-pruned branch is still listed and deletable.
    expect(screen.getByTestId('branch-prune-item-feature/gone')).toBeInTheDocument()
  })
})

describe('PruneBranchesDialog — confirming', () => {
  it('deletes each prunable branch (force off), invalidates branches, and closes', async () => {
    mockedGone.mockResolvedValue(['feature/a', 'feature/b'])
    mockedDeleteBranch.mockResolvedValue(undefined)
    const branches = [
      branch({ shortName: 'feature/a', commitOid: 'oid-a', upstream: 'origin/feature/a' }),
      branch({ shortName: 'feature/b', commitOid: 'oid-b' }),
    ]
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { invalidateSpy } = renderDialog({ branches, onClose })

    await waitFor(() =>
      expect(screen.getByTestId('branch-prune-item-feature/a')).toBeInTheDocument()
    )
    await user.click(screen.getByTestId('branch-prune-confirm-button'))

    expect(mockedDeleteBranch).toHaveBeenCalledWith('/repo', 'feature/a', {
      targetOid: 'oid-a',
      upstream: 'origin/feature/a',
    })
    expect(mockedDeleteBranch).toHaveBeenCalledWith('/repo', 'feature/b', {
      targetOid: 'oid-b',
      upstream: undefined,
    })
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['branches', '/repo'] })
  })

  it('keeps failed deletions listed and reports them, without closing', async () => {
    mockedGone.mockResolvedValue(['feature/ok', 'feature/fails'])
    mockedDeleteBranch.mockImplementation(async (_repo: string, name: string) => {
      if (name === 'feature/fails') throw new Error('not fully merged')
    })
    const branches = [branch({ shortName: 'feature/ok' }), branch({ shortName: 'feature/fails' })]
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ branches, onClose })

    await waitFor(() =>
      expect(screen.getByTestId('branch-prune-item-feature/ok')).toBeInTheDocument()
    )
    await user.click(screen.getByTestId('branch-prune-confirm-button'))

    await waitFor(() =>
      expect(screen.getByText(/branch.prunePartialFailure/)).toBeInTheDocument()
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByTestId('branch-prune-item-feature/ok')).not.toBeInTheDocument()
    expect(screen.getByTestId('branch-prune-item-feature/fails')).toBeInTheDocument()
  })

  it('cancel calls onClose without deleting anything', async () => {
    mockedGone.mockResolvedValue(['feature/x'])
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await user.click(screen.getByText('gitTree.contextMenu.cancel'))
    expect(onClose).toHaveBeenCalledOnce()
    expect(mockedDeleteBranch).not.toHaveBeenCalled()
  })
})
