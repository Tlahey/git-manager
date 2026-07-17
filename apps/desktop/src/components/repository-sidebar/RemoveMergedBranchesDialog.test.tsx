import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { GitBranch } from '@git-manager/git-types'
import type { BranchMergeCheck } from '../../hooks/useMergedBranches'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))
vi.mock('../../api/git.api', () => ({ apiDeleteBranch: vi.fn() }))
vi.mock('../../lib/clipboard', () => ({ copyWithToast: vi.fn() }))

const { useMergedBranchesMock } = vi.hoisted(() => ({ useMergedBranchesMock: vi.fn() }))
vi.mock('../../hooks/useMergedBranches', () => ({ useMergedBranches: useMergedBranchesMock }))

import { apiDeleteBranch } from '../../api/git.api'
import { copyWithToast } from '../../lib/clipboard'
import { RemoveMergedBranchesDialog } from './RemoveMergedBranchesDialog'

const mockedDeleteBranch = apiDeleteBranch as unknown as ReturnType<typeof vi.fn>
const mockedCopy = copyWithToast as unknown as ReturnType<typeof vi.fn>

function branch(overrides: Partial<GitBranch> = {}): GitBranch {
  return {
    name: 'refs/heads/feature/done',
    shortName: 'feature/done',
    isHead: false,
    isRemote: false,
    commitOid: 'abcdef1234567890',
    commitMessage: '',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
    ...overrides,
  }
}

function mergedCheck(b: GitBranch, prNumber = 1): BranchMergeCheck {
  return { branch: b, status: { merged: { number: prNumber, title: 'Some PR' } } }
}

function hookResult(
  checks: BranchMergeCheck[],
  overrides: { isLoading?: boolean; isGithub?: boolean; hasToken?: boolean } = {}
) {
  return {
    checks,
    mergedBranches: checks
      .filter((c) => typeof c.status === 'object' || c.status === 'branch-gone')
      .map((c) => c.branch),
    isLoading: false,
    isGithub: true,
    hasToken: true,
    ...overrides,
  }
}

function renderDialog(props: Partial<React.ComponentProps<typeof RemoveMergedBranchesDialog>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
  const utils = render(
    <QueryClientProvider client={client}>
      <RemoveMergedBranchesDialog
        repoPath="/repo"
        branches={[branch()]}
        worktreeBranches={[]}
        remoteUrls={['https://github.com/org/repo.git']}
        githubToken="tok"
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
  useMergedBranchesMock.mockReturnValue(hookResult([mergedCheck(branch())]))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RemoveMergedBranchesDialog — body states', () => {
  it('shows a no-GitHub-remote hint and disables confirm when nothing qualifies', () => {
    useMergedBranchesMock.mockReturnValue(hookResult([], { isGithub: false }))
    renderDialog()
    expect(screen.getByText('branch.removeMergedNoGithubRemote')).toBeInTheDocument()
    expect(screen.getByTestId('branch-remove-merged-confirm-button')).toBeDisabled()
  })

  it('shows a checking message while loading', () => {
    useMergedBranchesMock.mockReturnValue(hookResult([], { isLoading: true }))
    renderDialog()
    expect(screen.getByText('branch.removeMergedChecking')).toBeInTheDocument()
    expect(screen.getByTestId('branch-remove-merged-confirm-button')).toBeDisabled()
  })

  it('shows an empty-state message when nothing qualifies', () => {
    useMergedBranchesMock.mockReturnValue(
      hookResult([{ branch: branch(), status: 'no-match' }])
    )
    renderDialog()
    expect(screen.getByText('branch.removeMergedEmpty')).toBeInTheDocument()
    expect(screen.getByTestId('branch-remove-merged-confirm-button')).toBeDisabled()
  })

  it('renders a card per branch: name, SHA tag, status icon, reason only when not eligible', () => {
    const merged = branch({ shortName: 'feature/a', commitOid: 'aaaaaaa0000' })
    const worktree = branch({ shortName: 'feature/b' })
    const noMatch = branch({ shortName: 'feature/c' })
    useMergedBranchesMock.mockReturnValue(
      hookResult([
        mergedCheck(merged),
        { branch: worktree, status: 'worktree' },
        { branch: noMatch, status: 'no-match' },
      ])
    )
    renderDialog()

    const card = screen.getByTestId('branch-remove-merged-item-feature/a')
    expect(card).toHaveTextContent('feature/a')
    expect(card).toHaveTextContent('aaaaaaa') // short SHA
    expect(card.querySelector('.lucide-git-branch')).toBeTruthy()
    expect(screen.getByTitle('branch.removeMergedStatusMerged:{"number":1}')).toBeInTheDocument()
    expect(screen.queryByTestId('branch-remove-merged-reason-feature/a')).not.toBeInTheDocument()

    expect(screen.getByTestId('branch-remove-merged-reason-feature/b')).toHaveTextContent(
      'branch.removeMergedStatusWorktree'
    )
    expect(screen.getByTestId('branch-remove-merged-reason-feature/c')).toHaveTextContent(
      'branch.removeMergedStatusNoMatch'
    )
    expect(screen.getByTestId('branch-remove-merged-confirm-button')).toBeEnabled()
  })

  it('copies the tip SHA when a card tag is clicked', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByTestId('branch-remove-merged-copy-sha-feature/done'))
    expect(mockedCopy).toHaveBeenCalledWith('abcdef1234567890', 'SHA')
    expect(mockedDeleteBranch).not.toHaveBeenCalled()
  })
})

describe('RemoveMergedBranchesDialog — confirming', () => {
  it('deletes only merged branches (force off), invalidates, and closes', async () => {
    mockedDeleteBranch.mockResolvedValue(undefined)
    const merged = branch({ shortName: 'feature/a', commitOid: 'oid-a', upstream: 'origin/feature/a' })
    const noMatch = branch({ shortName: 'feature/b' })
    useMergedBranchesMock.mockReturnValue(
      hookResult([mergedCheck(merged), { branch: noMatch, status: 'no-match' }])
    )
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { invalidateSpy } = renderDialog({ onClose })

    await user.click(screen.getByTestId('branch-remove-merged-confirm-button'))

    expect(mockedDeleteBranch).toHaveBeenCalledWith('/repo', 'feature/a', {
      targetOid: 'oid-a',
      upstream: 'origin/feature/a',
    })
    expect(mockedDeleteBranch).not.toHaveBeenCalledWith('/repo', 'feature/b', expect.anything())
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['branches', '/repo'] })
  })

  it('keeps failed deletions listed for retry and reports them, without closing', async () => {
    const ok = branch({ shortName: 'feature/ok' })
    const fails = branch({ shortName: 'feature/fails' })
    useMergedBranchesMock.mockReturnValue(hookResult([mergedCheck(ok), mergedCheck(fails, 2)]))
    mockedDeleteBranch.mockImplementation(async (_repo: string, name: string) => {
      if (name === 'feature/fails') throw new Error('not fully merged')
    })
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })

    await user.click(screen.getByTestId('branch-remove-merged-confirm-button'))

    await waitFor(() =>
      expect(screen.getByText(/branch.removeMergedPartialFailure/)).toBeInTheDocument()
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByTestId('branch-remove-merged-item-feature/ok')).not.toBeInTheDocument()
    expect(screen.getByTestId('branch-remove-merged-item-feature/fails')).toBeInTheDocument()
  })

  it('cancel calls onClose without deleting anything', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await user.click(screen.getByText('gitTree.contextMenu.cancel'))
    expect(onClose).toHaveBeenCalledOnce()
    expect(mockedDeleteBranch).not.toHaveBeenCalled()
  })
})

describe('RemoveMergedBranchesDialog — mine-only mode', () => {
  it('offers only branches whose merged PR was authored by currentUser (case-insensitive)', () => {
    const mine = branch({ shortName: 'feature/mine' })
    const theirs = branch({ shortName: 'feature/theirs' })
    const goneNoPr = branch({ shortName: 'feature/gone' })
    useMergedBranchesMock.mockReturnValue(
      hookResult([
        { branch: mine, status: { merged: { number: 1, title: 'Mine', author: 'alice' } } },
        { branch: theirs, status: { merged: { number: 2, title: 'Theirs', author: 'bob' } } },
        { branch: goneNoPr, status: 'branch-gone' },
      ])
    )
    renderDialog({ mineOnly: true, currentUser: 'Alice' })

    expect(screen.getAllByText('branch.removeMyMerged').length).toBeGreaterThan(0)
    expect(screen.getByTestId('branch-remove-merged-item-feature/mine')).toBeInTheDocument()
    // Someone else's PR, and a gone-upstream branch with no PR author, are both excluded.
    expect(screen.queryByTestId('branch-remove-merged-item-feature/theirs')).not.toBeInTheDocument()
    expect(screen.queryByTestId('branch-remove-merged-item-feature/gone')).not.toBeInTheDocument()
    expect(screen.getByTestId('branch-remove-merged-confirm-button')).toBeEnabled()
  })

  it('deletes only the current user’s merged branches on confirm', async () => {
    mockedDeleteBranch.mockResolvedValue(undefined)
    const mine = branch({ shortName: 'feature/mine', commitOid: 'oid-mine' })
    const theirs = branch({ shortName: 'feature/theirs' })
    useMergedBranchesMock.mockReturnValue(
      hookResult([
        { branch: mine, status: { merged: { number: 1, title: 'Mine', author: 'alice' } } },
        { branch: theirs, status: { merged: { number: 2, title: 'Theirs', author: 'bob' } } },
      ])
    )
    const user = userEvent.setup()
    renderDialog({ mineOnly: true, currentUser: 'alice' })

    await user.click(screen.getByTestId('branch-remove-merged-confirm-button'))
    expect(mockedDeleteBranch).toHaveBeenCalledWith('/repo', 'feature/mine', expect.anything())
    expect(mockedDeleteBranch).not.toHaveBeenCalledWith('/repo', 'feature/theirs', expect.anything())
  })
})
