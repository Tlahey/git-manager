import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { GitRepo } from '@git-manager/git-types'
import { useBranchCheckout } from './useBranchCheckout'
import { apiCheckoutBranch, apiStashPush } from '../api/git.api'
import { apiOpenRepo } from '../api/repo.api'
import { toast } from '@git-manager/ui'
import { useStashDialogStore } from '../stores/stashDialog.store'

vi.mock('../api/git.api', () => ({
  apiCheckoutBranch: vi.fn(),
  apiStashPush: vi.fn(),
}))

vi.mock('../api/repo.api', () => ({
  apiOpenRepo: vi.fn(),
}))

vi.mock('@git-manager/ui', () => ({
  toast: {
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const mockInvalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}))

/** The JSON payload a `git checkout` refused for a dirty worktree comes back as (see error.rs). */
const DIRTY_WORKTREE_ERROR = new Error(
  '{"code":"GIT_ERROR","message":"Git error: 1 conflict prevents checkout","detail":null}'
)

const repo = { path: '/repo' } as GitRepo

describe('useBranchCheckout', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    useStashDialogStore.getState().closeDialog()
  })

  it('performs clean checkout when no conflict occurs', async () => {
    vi.mocked(apiCheckoutBranch).mockResolvedValue(undefined)
    vi.mocked(apiOpenRepo).mockResolvedValue(repo)

    const { result } = renderHook(() => useBranchCheckout())

    let res = false
    await act(async () => {
      res = await result.current.checkoutBranchWithStashPrompt('/repo', 'feature-x')
    })

    expect(res).toBe(true)
    expect(apiCheckoutBranch).toHaveBeenCalledWith('/repo', 'feature-x', undefined)
    expect(mockInvalidateQueries).toHaveBeenCalled()
    expect(useStashDialogStore.getState().isOpen).toBe(false)
  })

  it('opens the stash dialog when the checkout is blocked by local changes', async () => {
    vi.mocked(apiCheckoutBranch).mockRejectedValueOnce(DIRTY_WORKTREE_ERROR)

    const { result } = renderHook(() => useBranchCheckout())

    let res = false
    await act(async () => {
      res = await result.current.checkoutBranchWithStashPrompt('/repo', 'feature-x', {
        fromRef: 'main',
        fromDetached: false,
      })
    })

    expect(res).toBe(false)
    const state = useStashDialogStore.getState()
    expect(state.isOpen).toBe(true)
    expect(state.reason).toBe('checkout')
    expect(state.targetRef).toBe('feature-x')
    expect(state.checkoutOpts).toEqual({ fromRef: 'main', fromDetached: false })
    // The dialog is the only prompt — no redundant toast alongside it.
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('surfaces an unrelated checkout failure as an error toast, without the stash dialog', async () => {
    vi.mocked(apiCheckoutBranch).mockRejectedValueOnce(new Error('Branch not found: nope'))

    const { result } = renderHook(() => useBranchCheckout())

    let res = true
    await act(async () => {
      res = await result.current.checkoutBranchWithStashPrompt('/repo', 'nope')
    })

    expect(res).toBe(false)
    expect(useStashDialogStore.getState().isOpen).toBe(false)
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Branch not found'))
  })

  it('stashes changes and completes branch checkout via stashAndCheckout', async () => {
    vi.mocked(apiStashPush).mockResolvedValue(undefined)
    vi.mocked(apiCheckoutBranch).mockResolvedValue(undefined)
    vi.mocked(apiOpenRepo).mockResolvedValue(repo)

    useStashDialogStore.getState().openCheckoutDialog('/repo', 'feature-x')

    const { result } = renderHook(() => useBranchCheckout())

    let res = false
    await act(async () => {
      res = await result.current.stashAndCheckout('/repo', 'feature-x')
    })

    expect(res).toBe(true)
    expect(apiStashPush).toHaveBeenCalledWith(
      '/repo',
      'git-manager: checkout autostash (feature-x)',
      true
    )
    expect(apiCheckoutBranch).toHaveBeenCalledWith('/repo', 'feature-x', undefined)
    expect(useStashDialogStore.getState().isOpen).toBe(false)
    expect(toast.success).toHaveBeenCalledWith('Changes stashed and switched to feature-x')
  })

  it('keeps the dialog open and toasts when the stash itself fails', async () => {
    vi.mocked(apiStashPush).mockRejectedValueOnce(new Error('stash failed'))

    useStashDialogStore.getState().openCheckoutDialog('/repo', 'feature-x')

    const { result } = renderHook(() => useBranchCheckout())

    let res = true
    await act(async () => {
      res = await result.current.stashAndCheckout('/repo', 'feature-x')
    })

    expect(res).toBe(false)
    expect(apiCheckoutBranch).not.toHaveBeenCalled()
    expect(useStashDialogStore.getState().isOpen).toBe(true)
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('stash failed'))
  })
})
