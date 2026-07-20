import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { GitWorktree } from '@git-manager/git-types'
import type { WorktreeMergeCheck } from '../../hooks/useMergedWorktrees'

vi.mock('../../api/worktree.api', () => ({ apiRemoveWorktree: vi.fn() }))

const { useMergedWorktreesMock } = vi.hoisted(() => ({ useMergedWorktreesMock: vi.fn() }))
vi.mock('../../hooks/useMergedWorktrees', () => ({ useMergedWorktrees: useMergedWorktreesMock }))

import { apiRemoveWorktree } from '../../api/worktree.api'
import { RemoveMergedWorktreesDialog } from './RemoveMergedWorktreesDialog'

const mockedRemoveWorktree = apiRemoveWorktree as unknown as ReturnType<typeof vi.fn>

function worktree(overrides: Partial<GitWorktree> = {}): GitWorktree {
  return {
    path: '/tmp/repo-merged',
    branch: 'feature/done',
    commitOid: 'oid1',
    isMain: false,
    isLocked: false,
    isDirty: false,
    isPrunable: false,
    ...overrides,
  }
}

function mergedCheck(wt: GitWorktree, prNumber = 1): WorktreeMergeCheck {
  return { worktree: wt, status: { merged: { number: prNumber, title: 'Some PR' } } }
}

function hookResult(
  checks: WorktreeMergeCheck[],
  overrides: { isLoading?: boolean; isGithub?: boolean; hasToken?: boolean } = {}
) {
  return {
    checks,
    mergedWorktrees: checks
      .filter((c) => typeof c.status === 'object')
      .map((c) => c.worktree),
    isLoading: false,
    isGithub: true,
    hasToken: true,
    ...overrides,
  }
}

function renderDialog(props: Partial<React.ComponentProps<typeof RemoveMergedWorktreesDialog>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
  const utils = render(
    <QueryClientProvider client={client}>
      <RemoveMergedWorktreesDialog
        repoPath="/repo"
        worktrees={[worktree()]}
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
  useMergedWorktreesMock.mockReturnValue(hookResult([mergedCheck(worktree())]))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RemoveMergedWorktreesDialog — body states', () => {
  it('shows a no-GitHub-remote message and disables confirm', () => {
    useMergedWorktreesMock.mockReturnValue(hookResult([], { isGithub: false }))
    renderDialog()
    expect(screen.getByText("No GitHub remote — detecting merged branches locally (deleted remote branch) only.")).toBeInTheDocument()
    expect(screen.getByTestId('worktree-remove-merged-confirm-button')).toBeDisabled()
  })

  it('shows a no-token message and disables confirm', () => {
    useMergedWorktreesMock.mockReturnValue(hookResult([], { hasToken: false }))
    renderDialog()
    expect(screen.getByText("No GitHub account connected — detecting merged branches locally (deleted remote branch) only.")).toBeInTheDocument()
    expect(screen.getByTestId('worktree-remove-merged-confirm-button')).toBeDisabled()
  })

  it('shows a checking message and spinner while loading', () => {
    useMergedWorktreesMock.mockReturnValue(hookResult([], { isLoading: true }))
    renderDialog()
    expect(screen.getByText("Checking merge status…")).toBeInTheDocument()
    expect(screen.getByTestId('worktree-remove-merged-confirm-button')).toBeDisabled()
  })

  it('shows an empty-state message when nothing qualifies', () => {
    useMergedWorktreesMock.mockReturnValue(
      hookResult([{ worktree: worktree(), status: 'no-match' }])
    )
    renderDialog()
    expect(screen.getByText("No worktrees qualify right now — none are both clean and merged (remote branch gone or a merged pull request).")).toBeInTheDocument()
    expect(screen.getByTestId('worktree-remove-merged-confirm-button')).toBeDisabled()
  })

  it('renders one card per worktree: name, path caption, status icon, and a reason only when not eligible', () => {
    const merged = worktree({ path: '/tmp/wt-a', branch: 'feature/a' })
    const dirty = worktree({ path: '/tmp/wt-b', branch: 'feature/b', isDirty: true })
    const detached = worktree({ path: '/tmp/wt-c', branch: '(detached HEAD)' })
    const noMatch = worktree({ path: '/tmp/wt-d', branch: 'feature/d' })
    useMergedWorktreesMock.mockReturnValue(
      hookResult([
        mergedCheck(merged),
        { worktree: dirty, status: 'dirty' },
        { worktree: detached, status: 'detached' },
        { worktree: noMatch, status: 'no-match' },
      ])
    )
    renderDialog()

    // Eligible card: worktree icon + name, path tag, green-check detail in the icon tooltip,
    // NO reason line.
    const mergedCard = screen.getByTestId('worktree-remove-merged-item-/tmp/wt-a')
    expect(mergedCard).toHaveTextContent('feature/a')
    expect(mergedCard).toHaveTextContent('/tmp/wt-a')
    expect(mergedCard.querySelector('.lucide-layers')).toBeTruthy()
    expect(
      screen.getByTitle("Merged in PR #1")
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId('worktree-remove-merged-reason-/tmp/wt-a')
    ).not.toBeInTheDocument()

    // Non-eligible cards spell out their reason under the name/path block.
    expect(screen.getByTestId('worktree-remove-merged-reason-/tmp/wt-b')).toHaveTextContent(
      "Uncommitted changes"
    )
    expect(screen.getByTestId('worktree-remove-merged-reason-/tmp/wt-c')).toHaveTextContent(
      "Not on a branch"
    )
    expect(screen.getByTestId('worktree-remove-merged-reason-/tmp/wt-d')).toHaveTextContent(
      "Not merged (remote branch still exists, no merged PR)"
    )
    expect(screen.getByTestId('worktree-remove-merged-confirm-button')).toBeEnabled()
  })

  it('shows a green check with a tooltip and no reason for a branch-gone worktree', () => {
    const gone = worktree({ path: '/tmp/wt-gone', branch: 'feature/gone' })
    useMergedWorktreesMock.mockReturnValue(
      hookResult([{ worktree: gone, status: 'branch-gone' }])
    )
    renderDialog()
    expect(screen.getByTitle("Merged (remote branch deleted)")).toBeInTheDocument()
    expect(
      screen.queryByTestId('worktree-remove-merged-reason-/tmp/wt-gone')
    ).not.toBeInTheDocument()
  })

  it('copies the worktree path when its tag is clicked', async () => {
    const user = userEvent.setup()
    // Defined after setup(): userEvent installs its own clipboard stub on navigator during setup.
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderDialog()

    await user.click(screen.getByTestId('worktree-remove-merged-copy-path-/tmp/repo-merged'))

    expect(writeText).toHaveBeenCalledWith('/tmp/repo-merged')
    expect(mockedRemoveWorktree).not.toHaveBeenCalled()
  })
})

describe('RemoveMergedWorktreesDialog — confirming', () => {
  it('removes only the merged worktrees (not dirty/detached/no-match ones), invalidates, and closes', async () => {
    mockedRemoveWorktree.mockResolvedValue(undefined)
    const merged = worktree({ path: '/tmp/wt-a', branch: 'feature/a' })
    const dirty = worktree({ path: '/tmp/wt-b', branch: 'feature/b', isDirty: true })
    useMergedWorktreesMock.mockReturnValue(
      hookResult([mergedCheck(merged), { worktree: dirty, status: 'dirty' }])
    )
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { invalidateSpy } = renderDialog({ onClose })

    await user.click(screen.getByTestId('worktree-remove-merged-confirm-button'))

    expect(mockedRemoveWorktree).toHaveBeenCalledWith('/repo', '/tmp/wt-a')
    expect(mockedRemoveWorktree).not.toHaveBeenCalledWith('/repo', '/tmp/wt-b')
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['worktrees', '/repo'] })
  })

  it('keeps failed removals listed for retry and reports them, without closing', async () => {
    const ok = worktree({ path: '/tmp/ok', branch: 'feature/ok' })
    const fails = worktree({ path: '/tmp/fails', branch: 'feature/fails' })
    useMergedWorktreesMock.mockReturnValue(
      hookResult([mergedCheck(ok), mergedCheck(fails, 2)])
    )
    mockedRemoveWorktree.mockImplementation(async (_path: string, worktreePath: string) => {
      if (worktreePath === '/tmp/fails') throw new Error('boom')
    })
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })

    await user.click(screen.getByTestId('worktree-remove-merged-confirm-button'))

    await waitFor(() =>
      expect(screen.getByText(/Some worktrees could not be removed/)).toBeInTheDocument()
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByTestId('worktree-remove-merged-item-/tmp/ok')).not.toBeInTheDocument()
    expect(screen.getByTestId('worktree-remove-merged-item-/tmp/fails')).toBeInTheDocument()
  })

  it('cancel calls onClose without removing anything', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })

    await user.click(screen.getByText("Cancel"))

    expect(onClose).toHaveBeenCalledOnce()
    expect(mockedRemoveWorktree).not.toHaveBeenCalled()
  })
})

describe('RemoveMergedWorktreesDialog — mine-only mode', () => {
  it('offers and removes only worktrees whose merged PR was authored by currentUser', async () => {
    mockedRemoveWorktree.mockResolvedValue(undefined)
    const mine = worktree({ path: '/tmp/mine', branch: 'feature/mine' })
    const theirs = worktree({ path: '/tmp/theirs', branch: 'feature/theirs' })
    const goneNoPr = worktree({ path: '/tmp/gone', branch: 'feature/gone' })
    useMergedWorktreesMock.mockReturnValue(
      hookResult([
        { worktree: mine, status: { merged: { number: 1, title: 'Mine', author: 'alice' } } },
        { worktree: theirs, status: { merged: { number: 2, title: 'Theirs', author: 'bob' } } },
        { worktree: goneNoPr, status: 'branch-gone' },
      ])
    )
    const user = userEvent.setup()
    renderDialog({ mineOnly: true, currentUser: 'Alice' })

    expect(screen.getAllByText("Remove my merged worktrees").length).toBeGreaterThan(0)
    expect(screen.getByTestId('worktree-remove-merged-item-/tmp/mine')).toBeInTheDocument()
    expect(screen.queryByTestId('worktree-remove-merged-item-/tmp/theirs')).not.toBeInTheDocument()
    expect(screen.queryByTestId('worktree-remove-merged-item-/tmp/gone')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('worktree-remove-merged-confirm-button'))
    expect(mockedRemoveWorktree).toHaveBeenCalledWith('/repo', '/tmp/mine')
    expect(mockedRemoveWorktree).not.toHaveBeenCalledWith('/repo', '/tmp/theirs')
  })
})
