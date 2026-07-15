import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../api/git.api', () => ({
  apiCheckoutBranch: vi.fn(),
  apiPushBranch: vi.fn(),
}))

vi.mock('../api/github.api', () => ({
  createPullRequest: vi.fn(),
  fetchRepoDefaultBranch: vi.fn(),
}))

const { useRepoGitHubMock, mutateMock } = vi.hoisted(() => ({
  useRepoGitHubMock: vi.fn(),
  mutateMock: vi.fn(),
}))
vi.mock('./useRepoGitHub', () => ({ useRepoGitHub: useRepoGitHubMock }))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('swr', () => ({ default: () => ({ data: 'main' }), mutate: mutateMock }))

import { apiCheckoutBranch, apiPushBranch } from '../api/git.api'
import { createPullRequest } from '../api/github.api'
import { usePrCreateFlow } from './usePrCreateFlow'
import { useRepoDataStore } from '../stores/repoData.store'
import { useRepoUIStore } from '../stores/repoUI.store'

const REPO = '/repo'
const m = {
  checkout: apiCheckoutBranch as unknown as ReturnType<typeof vi.fn>,
  push: apiPushBranch as unknown as ReturnType<typeof vi.fn>,
  createPr: createPullRequest as unknown as ReturnType<typeof vi.fn>,
}

function setBranch(head: string, isDetached = false) {
  useRepoDataStore.setState({
    repoCache: {
      [REPO]: { path: REPO, name: 'repo', head, isDetached, isDirty: false, remotes: [] },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  useRepoGitHubMock.mockReturnValue({ ownerRepo: { owner: 'org', repo: 'repo' }, token: 'tok' })
  m.createPr.mockResolvedValue({ number: 99, html_url: 'https://github.com/org/repo/pull/99' })
  setBranch('feature-x')
  useRepoUIStore.setState({ activePrNumber: null, prCreateOpen: true, prComposer: null })
})

describe('usePrCreateFlow — createPr', () => {
  it('pushes the current branch, creates a draft PR and switches the view to it', async () => {
    const { result } = renderHook(() => usePrCreateFlow(REPO))
    await act(async () => {
      await result.current.createPr({
        head: 'feature-x',
        base: 'main',
        title: 'T',
        body: 'B',
        draft: true,
      })
    })
    // Head equals current branch → no checkout.
    expect(m.checkout).not.toHaveBeenCalled()
    expect(m.push).toHaveBeenCalledWith(REPO)
    expect(m.createPr).toHaveBeenCalledWith(
      'org',
      'repo',
      { title: 'T', head: 'feature-x', base: 'main', body: 'B', draft: true },
      'tok'
    )
    expect(mutateMock).toHaveBeenCalledWith(['repo-pull-requests', 'org', 'repo', 'tok'])
    expect(useRepoUIStore.getState().activePrNumber).toBe(99)
    expect(useRepoUIStore.getState().prCreateOpen).toBe(false)
  })

  it('checks out the head branch first when it differs from the current branch', async () => {
    setBranch('feature-x')
    const { result } = renderHook(() => usePrCreateFlow(REPO))
    await act(async () => {
      await result.current.createPr({
        head: 'other',
        base: 'main',
        title: 'T',
        body: '',
        draft: false,
      })
    })
    expect(m.checkout).toHaveBeenCalledWith(REPO, 'other', {
      fromRef: 'feature-x',
      fromDetached: false,
    })
    // Order: checkout → push → create
    expect(m.checkout.mock.invocationCallOrder[0]).toBeLessThan(m.push.mock.invocationCallOrder[0])
    expect(m.push.mock.invocationCallOrder[0]).toBeLessThan(m.createPr.mock.invocationCallOrder[0])
  })

  it('surfaces an error and keeps the view open when the push fails', async () => {
    m.push.mockRejectedValueOnce(new Error('push denied'))
    const { result } = renderHook(() => usePrCreateFlow(REPO))
    await act(async () => {
      await expect(
        result.current.createPr({ head: 'feature-x', base: 'main', title: 'T', body: '', draft: false })
      ).rejects.toThrow()
    })
    expect(m.createPr).not.toHaveBeenCalled()
    expect(result.current.error).toContain('push denied')
    expect(useRepoUIStore.getState().prCreateOpen).toBe(true)
  })

  it('does nothing when signed out', async () => {
    useRepoGitHubMock.mockReturnValue({ ownerRepo: { owner: 'org', repo: 'repo' }, token: null })
    const { result } = renderHook(() => usePrCreateFlow(REPO))
    await act(async () => {
      await result.current.createPr({ head: 'feature-x', base: 'main', title: 'T', body: '', draft: false })
    })
    expect(m.push).not.toHaveBeenCalled()
    expect(m.createPr).not.toHaveBeenCalled()
  })

  it('exposes the current branch and default base', () => {
    const { result } = renderHook(() => usePrCreateFlow(REPO))
    expect(result.current.currentBranch).toBe('feature-x')
    expect(result.current.defaultBase).toBe('main')
  })

  it('cancel() closes the view and clears the error', () => {
    const { result } = renderHook(() => usePrCreateFlow(REPO))
    act(() => result.current.cancel())
    expect(useRepoUIStore.getState().prCreateOpen).toBe(false)
    expect(result.current.error).toBeNull()
  })
})
