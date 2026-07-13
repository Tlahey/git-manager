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
vi.mock('../../api/worktree.api', () => ({ apiRemoveWorktree: vi.fn() }))

import { apiRemoveWorktree } from '../../api/worktree.api'
import { RemoveWorktreeDialog } from './RemoveWorktreeDialog'

const mockedRemoveWorktree = apiRemoveWorktree as unknown as ReturnType<typeof vi.fn>

function worktree(overrides: Partial<GitWorktree> = {}): GitWorktree {
  return {
    path: '/tmp/git-manager-fixtures/worktree-repo-linked',
    branch: 'feature/login',
    commitOid: 'abcdef1',
    isMain: false,
    isLocked: false,
    isDirty: false,
    isPrunable: false,
    ...overrides,
  }
}

function renderDialog(props: Partial<React.ComponentProps<typeof RemoveWorktreeDialog>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
  const utils = render(
    <QueryClientProvider client={client}>
      <RemoveWorktreeDialog repoPath="/repo" worktree={worktree()} onClose={vi.fn()} {...props} />
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

describe('RemoveWorktreeDialog — rendering', () => {
  it('renders nothing when worktree is null', () => {
    const { container } = renderDialog({ worktree: null })
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the path and an enabled confirm button for a clean worktree', () => {
    renderDialog()
    expect(screen.getByText('/tmp/git-manager-fixtures/worktree-repo-linked')).toBeInTheDocument()
    expect(screen.getByTestId('worktree-remove-confirm-button')).toBeEnabled()
    expect(screen.queryByTestId('worktree-remove-force-checkbox')).not.toBeInTheDocument()
  })
})

describe('RemoveWorktreeDialog — dirty gating', () => {
  it('disables confirm until the force checkbox is checked', async () => {
    const user = userEvent.setup()
    renderDialog({ worktree: worktree({ isDirty: true }) })
    expect(screen.getByTestId('worktree-remove-confirm-button')).toBeDisabled()
    await user.click(screen.getByTestId('worktree-remove-force-checkbox'))
    expect(screen.getByTestId('worktree-remove-confirm-button')).toBeEnabled()
  })

  it('passes force=true once checked', async () => {
    mockedRemoveWorktree.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderDialog({ worktree: worktree({ isDirty: true }) })
    await user.click(screen.getByTestId('worktree-remove-force-checkbox'))
    await user.click(screen.getByTestId('worktree-remove-confirm-button'))
    expect(mockedRemoveWorktree).toHaveBeenCalledWith(
      '/repo',
      '/tmp/git-manager-fixtures/worktree-repo-linked',
      true
    )
  })
})

describe('RemoveWorktreeDialog — locked worktree', () => {
  it('blocks confirm entirely, with no force checkbox offered', () => {
    renderDialog({ worktree: worktree({ isLocked: true, lockedReason: 'external tool' }) })
    expect(screen.getByTestId('worktree-remove-confirm-button')).toBeDisabled()
    expect(screen.queryByTestId('worktree-remove-force-checkbox')).not.toBeInTheDocument()
  })
})

describe('RemoveWorktreeDialog — removing', () => {
  it('removes a clean worktree with force=false, invalidates, and closes', async () => {
    mockedRemoveWorktree.mockResolvedValue(undefined)
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { invalidateSpy } = renderDialog({ onClose })
    await user.click(screen.getByTestId('worktree-remove-confirm-button'))

    expect(mockedRemoveWorktree).toHaveBeenCalledWith(
      '/repo',
      '/tmp/git-manager-fixtures/worktree-repo-linked',
      false
    )
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['worktrees', '/repo'] })
  })

  it('shows an inline error and stays open when removal fails', async () => {
    mockedRemoveWorktree.mockRejectedValue(new Error('git worktree remove failed'))
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await user.click(screen.getByTestId('worktree-remove-confirm-button'))

    expect(await screen.findByText(/git worktree remove failed/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cancel calls onClose without removing', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onClose })
    await user.click(screen.getByText('gitTree.contextMenu.cancel'))
    expect(onClose).toHaveBeenCalledOnce()
    expect(mockedRemoveWorktree).not.toHaveBeenCalled()
  })
})
