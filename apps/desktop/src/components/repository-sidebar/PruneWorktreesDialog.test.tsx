import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { GitWorktree } from '@git-manager/git-types'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))
vi.mock('../../api/worktree.api', () => ({ apiPruneWorktrees: vi.fn() }))

import { apiPruneWorktrees } from '../../api/worktree.api'
import { PruneWorktreesDialog } from './PruneWorktreesDialog'

const mockedPruneWorktrees = apiPruneWorktrees as unknown as ReturnType<typeof vi.fn>

function worktree(overrides: Partial<GitWorktree> = {}): GitWorktree {
  return {
    path: '/tmp/git-manager-fixtures/worktree-repo-stale',
    branch: 'feature/old',
    commitOid: 'abcdef1',
    isMain: false,
    isLocked: false,
    isDirty: false,
    isPrunable: true,
    ...overrides,
  }
}

function renderDialog(props: Partial<React.ComponentProps<typeof PruneWorktreesDialog>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
  const utils = render(
    <QueryClientProvider client={client}>
      <PruneWorktreesDialog
        repoPath="/repo"
        worktrees={[worktree()]}
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
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PruneWorktreesDialog — rendering', () => {
  it('lists each prunable worktree by branch and path', () => {
    renderDialog({
      worktrees: [
        worktree({ path: '/tmp/wt-a', branch: 'feature/a' }),
        worktree({ path: '/tmp/wt-b', branch: 'feature/b' }),
      ],
    })
    expect(screen.getByTestId('worktree-prune-item-/tmp/wt-a')).toHaveTextContent(
      'feature/a — /tmp/wt-a'
    )
    expect(screen.getByTestId('worktree-prune-item-/tmp/wt-b')).toHaveTextContent(
      'feature/b — /tmp/wt-b'
    )
  })

  it('shows an empty-state message and disables confirm when there is nothing to prune', () => {
    renderDialog({ worktrees: [] })
    expect(screen.getByText('worktree.pruneEmpty')).toBeInTheDocument()
    expect(screen.queryByTestId(/worktree-prune-item-/)).not.toBeInTheDocument()
    expect(screen.getByTestId('worktree-prune-confirm-button')).toBeDisabled()
  })
})

describe('PruneWorktreesDialog — confirming', () => {
  it('prunes, invalidates the worktrees query, and closes', async () => {
    mockedPruneWorktrees.mockResolvedValue(undefined)
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { invalidateSpy } = renderDialog({ onClose })

    await user.click(screen.getByTestId('worktree-prune-confirm-button'))

    expect(mockedPruneWorktrees).toHaveBeenCalledWith('/repo')
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['worktrees', '/repo'] })
  })

  it('shows an inline error and stays open when pruning fails', async () => {
    mockedPruneWorktrees.mockRejectedValue(new Error('git worktree prune failed'))
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })

    await user.click(screen.getByTestId('worktree-prune-confirm-button'))

    expect(await screen.findByText(/git worktree prune failed/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cancel calls onClose without pruning', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })

    await user.click(screen.getByText('gitTree.contextMenu.cancel'))

    expect(onClose).toHaveBeenCalledOnce()
    expect(mockedPruneWorktrees).not.toHaveBeenCalled()
  })
})
