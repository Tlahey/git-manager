import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../api/git.api', () => ({
  apiCreateBranch: vi.fn(),
  apiCheckoutBranch: vi.fn(),
  apiPushBranch: vi.fn(),
  apiCreateCommit: vi.fn(),
}))

vi.mock('../api/github.api', () => ({
  createPullRequest: vi.fn(),
  fetchRepoDefaultBranch: vi.fn(),
}))

const { useRepoGitHubMock } = vi.hoisted(() => ({ useRepoGitHubMock: vi.fn() }))
vi.mock('./useRepoGitHub', () => ({ useRepoGitHub: useRepoGitHubMock }))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('swr', () => ({ default: () => ({ data: 'main' }) }))

import { apiCreateBranch, apiCheckoutBranch, apiPushBranch, apiCreateCommit } from '../api/git.api'
import { createPullRequest } from '../api/github.api'
import { usePrPublishFlow } from './usePrPublishFlow'
import { useRepoDataStore } from '../stores/repoData.store'
import { useRepoUIStore } from '../stores/repoUI.store'

const REPO = '/repo'
const m = {
  createBranch: apiCreateBranch as unknown as ReturnType<typeof vi.fn>,
  checkout: apiCheckoutBranch as unknown as ReturnType<typeof vi.fn>,
  push: apiPushBranch as unknown as ReturnType<typeof vi.fn>,
  commit: apiCreateCommit as unknown as ReturnType<typeof vi.fn>,
  createPr: createPullRequest as unknown as ReturnType<typeof vi.fn>,
}

function setBranch(head: string, isDetached = false) {
  useRepoDataStore.setState({
    repoCache: {
      [REPO]: { path: REPO, name: 'repo', head, isDetached, isDirty: true, remotes: [] },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  useRepoGitHubMock.mockReturnValue({ ownerRepo: { owner: 'org', repo: 'repo' }, token: 'tok' })
  m.createPr.mockResolvedValue({ number: 99, html_url: 'https://github.com/org/repo/pull/99' })
  setBranch('feature-x')
  useRepoUIStore.setState({ activePrNumber: null, prComposer: null })
})

describe('usePrPublishFlow — mode detection', () => {
  it('is "protected" on a protected branch', () => {
    setBranch('main')
    const { result } = renderHook(() => usePrPublishFlow(REPO))
    expect(result.current.mode).toBe('protected')
  })

  it('is "feature" on a non-protected branch', () => {
    setBranch('feature-x')
    const { result } = renderHook(() => usePrPublishFlow(REPO))
    expect(result.current.mode).toBe('feature')
  })

  it('is "unavailable" when signed out', () => {
    useRepoGitHubMock.mockReturnValue({ ownerRepo: { owner: 'org', repo: 'repo' }, token: null })
    const { result } = renderHook(() => usePrPublishFlow(REPO))
    expect(result.current.mode).toBe('unavailable')
  })

  it('is "unavailable" on a detached HEAD', () => {
    setBranch('abc123', true)
    const { result } = renderHook(() => usePrPublishFlow(REPO))
    expect(result.current.mode).toBe('unavailable')
  })
})

describe('usePrPublishFlow — commitAndPrepare', () => {
  it('feature branch: commits without creating a branch and hands off to the composer', async () => {
    setBranch('feature-x')
    const { result } = renderHook(() => usePrPublishFlow(REPO))
    await act(async () => {
      await result.current.commitAndPrepare({ commitMessage: 'feat: x' })
    })
    expect(m.createBranch).not.toHaveBeenCalled()
    expect(m.commit).toHaveBeenCalledWith(REPO, 'feat: x')
    // Handoff lives in the store (survives the WIP panel unmounting on commit).
    expect(useRepoUIStore.getState().prComposer).toEqual({
      head: 'feature-x',
      baseRef: 'main',
      title: 'feat: x',
    })
    expect(result.current.composer?.head).toBe('feature-x')
  })

  it('protected branch: creates + checks out a branch, then commits, in order', async () => {
    setBranch('main')
    const { result } = renderHook(() => usePrPublishFlow(REPO))
    await act(async () => {
      await result.current.commitAndPrepare({ commitMessage: 'feat: x', newBranchName: 'feat/x' })
    })
    expect(m.createBranch).toHaveBeenCalledWith(REPO, 'feat/x', 'HEAD')
    expect(m.checkout).toHaveBeenCalledWith(REPO, 'feat/x', {
      fromRef: 'main',
      fromDetached: false,
    })
    // Order: branch → checkout → commit
    expect(m.createBranch.mock.invocationCallOrder[0]).toBeLessThan(
      m.checkout.mock.invocationCallOrder[0]
    )
    expect(m.checkout.mock.invocationCallOrder[0]).toBeLessThan(
      m.commit.mock.invocationCallOrder[0]
    )
    expect(result.current.composer?.head).toBe('feat/x')
    // A protected-branch PR targets the branch you branched from, not the GitHub default.
    expect(result.current.composer?.baseRef).toBe('main')
    expect(result.current.defaultBaseRef).toBe('main')
  })

  it('protected branch: requires a new branch name', async () => {
    setBranch('main')
    const { result } = renderHook(() => usePrPublishFlow(REPO))
    await act(async () => {
      await expect(
        result.current.commitAndPrepare({ commitMessage: 'feat: x' })
      ).rejects.toThrow()
    })
    expect(m.commit).not.toHaveBeenCalled()
    expect(useRepoUIStore.getState().prComposer).toBeNull()
    expect(result.current.error).toContain('branch name')
  })
})

describe('usePrPublishFlow — createPr', () => {
  it('pushes, creates the PR and switches the repo view to it', async () => {
    setBranch('feature-x')
    const { result } = renderHook(() => usePrPublishFlow(REPO))
    await act(async () => {
      await result.current.commitAndPrepare({ commitMessage: 'feat: x' })
    })
    await act(async () => {
      await result.current.createPr({ title: 'T', body: 'B', baseRef: 'main' })
    })
    expect(m.push).toHaveBeenCalledWith(REPO)
    expect(m.createPr).toHaveBeenCalledWith(
      'org',
      'repo',
      { title: 'T', head: 'feature-x', base: 'main', body: 'B' },
      'tok'
    )
    expect(useRepoUIStore.getState().activePrNumber).toBe(99)
    // The composer is dismissed once the PR exists (the PR view takes over).
    expect(useRepoUIStore.getState().prComposer).toBeNull()
  })

  it('surfaces an error and keeps the composer open when the push fails', async () => {
    setBranch('feature-x')
    m.push.mockRejectedValueOnce(new Error('push denied'))
    const { result } = renderHook(() => usePrPublishFlow(REPO))
    await act(async () => {
      await result.current.commitAndPrepare({ commitMessage: 'feat: x' })
    })
    await act(async () => {
      await expect(
        result.current.createPr({ title: 'T', body: 'B', baseRef: 'main' })
      ).rejects.toThrow()
    })
    expect(m.createPr).not.toHaveBeenCalled()
    expect(result.current.error).toContain('push denied')
    // Composer stays open so the user can retry / read the error.
    expect(useRepoUIStore.getState().prComposer).not.toBeNull()
  })

  it('cancel() dismisses the composer and clears the error', async () => {
    setBranch('feature-x')
    const { result } = renderHook(() => usePrPublishFlow(REPO))
    await act(async () => {
      await result.current.commitAndPrepare({ commitMessage: 'feat: x' })
    })
    act(() => result.current.cancel())
    expect(useRepoUIStore.getState().prComposer).toBeNull()
    expect(result.current.error).toBeNull()
  })
})
