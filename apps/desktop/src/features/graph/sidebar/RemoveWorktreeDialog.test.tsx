import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { GitWorktree } from '@git-manager/git-types'

vi.mock('../../../api/worktree.api', () => ({ apiRemoveWorktree: vi.fn() }))
vi.mock('../../../api/git.api', () => ({ apiDeleteBranch: vi.fn() }))

import { apiRemoveWorktree } from '../../../api/worktree.api'
import { apiDeleteBranch } from '../../../api/git.api'
import { RemoveWorktreeDialog } from './RemoveWorktreeDialog'

const mockedRemoveWorktree = apiRemoveWorktree as unknown as ReturnType<typeof vi.fn>
const mockedDeleteBranch = apiDeleteBranch as unknown as ReturnType<typeof vi.fn>

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
    await user.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledOnce()
    expect(mockedRemoveWorktree).not.toHaveBeenCalled()
  })
})

describe('RemoveWorktreeDialog — also deleting the branch', () => {
  it('does not touch the branch in the default mode', async () => {
    mockedRemoveWorktree.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByTestId('worktree-remove-confirm-button'))

    expect(mockedDeleteBranch).not.toHaveBeenCalled()
    expect(screen.queryByTestId('worktree-remove-branch-warning')).not.toBeInTheDocument()
  })

  it('warns which branch will go, naming it', () => {
    renderDialog({ deleteBranch: true })
    expect(screen.getByTestId('worktree-remove-branch-warning')).toHaveTextContent('feature/login')
    expect(screen.getByText('Remove worktree and delete branch')).toBeInTheDocument()
  })

  // Order matters: git refuses to delete a branch that is still checked out somewhere, and this
  // worktree is what was holding it.
  it('deletes the branch only after the worktree is gone', async () => {
    const order: string[] = []
    mockedRemoveWorktree.mockImplementation(async () => void order.push('remove-worktree'))
    mockedDeleteBranch.mockImplementation(async () => void order.push('delete-branch'))
    const user = userEvent.setup()
    renderDialog({ deleteBranch: true })

    await user.click(screen.getByTestId('worktree-remove-confirm-button'))

    await waitFor(() => expect(order).toEqual(['remove-worktree', 'delete-branch']))
  })

  it('forces the branch delete and pins its tip for undo', async () => {
    mockedRemoveWorktree.mockResolvedValue(undefined)
    mockedDeleteBranch.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderDialog({ deleteBranch: true })

    await user.click(screen.getByTestId('worktree-remove-confirm-button'))

    await waitFor(() =>
      expect(mockedDeleteBranch).toHaveBeenCalledWith('/repo', 'feature/login', {
        targetOid: 'abcdef1',
        force: true,
      })
    )
  })

  it('refreshes the branch list as well as the worktree list', async () => {
    mockedRemoveWorktree.mockResolvedValue(undefined)
    mockedDeleteBranch.mockResolvedValue(undefined)
    const user = userEvent.setup()
    const { invalidateSpy } = renderDialog({ deleteBranch: true })

    await user.click(screen.getByTestId('worktree-remove-confirm-button'))

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['branches', '/repo'] })
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['worktrees', '/repo'] })
  })

  it('surfaces a branch-delete failure and stays open', async () => {
    mockedRemoveWorktree.mockResolvedValue(undefined)
    mockedDeleteBranch.mockRejectedValue(new Error('branch is not fully merged'))
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderDialog({ deleteBranch: true, onClose })

    await user.click(screen.getByTestId('worktree-remove-confirm-button'))

    expect(await screen.findByText(/branch is not fully merged/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
