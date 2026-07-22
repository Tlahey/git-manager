import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { GitBranch, PullRequest } from '@git-manager/git-types'

const useBranchesMock = vi.fn()
const usePullRequestsMock = vi.fn()
const useMergedPrsByBranchMock = vi.fn()
vi.mock('./useBranches', () => ({ useBranches: () => useBranchesMock() }))
vi.mock('./usePullRequests', () => ({ usePullRequests: () => usePullRequestsMock() }))
vi.mock('./useMergedPrsByBranch', () => ({
  useMergedPrsByBranch: () => useMergedPrsByBranchMock(),
}))

import { useActiveBranchPr } from './useActiveBranchPr'
import { useRepoUIStore } from '../stores/repoUI.store'
import { useRepoDataStore } from '../stores/repoData.store'

function branch(shortName: string, isHead = false): GitBranch {
  return {
    name: `refs/heads/${shortName}`,
    shortName,
    isHead,
    isRemote: false,
    commitOid: 'oid',
    commitMessage: 'm',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
  }
}

function pr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 1,
    title: 'PR',
    body: '',
    state: 'open',
    author: 'a',
    authorAvatar: '',
    headRef: 'feature-x',
    baseRef: 'main',
    url: '',
    ciStatus: null,
    createdAt: '',
    updatedAt: '',
    isDraft: false,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useRepoUIStore.setState({ activeRepo: '/repo', activeWorkspacePath: null })
  useRepoDataStore.setState({ repoCache: { '/repo': { remotes: [] } as never } })
  useBranchesMock.mockReturnValue({ data: [branch('feature-x', true)] })
  usePullRequestsMock.mockReturnValue({ allPrs: [] })
  useMergedPrsByBranchMock.mockReturnValue(new Map())
})

describe('useActiveBranchPr', () => {
  it('returns undefined when the HEAD branch has no linked PR', () => {
    const { result } = renderHook(() => useActiveBranchPr())
    expect(result.current).toBeUndefined()
  })

  it('returns undefined when no branch is HEAD', () => {
    useBranchesMock.mockReturnValue({ data: [branch('feature-x', false)] })
    usePullRequestsMock.mockReturnValue({ allPrs: [pr({ number: 9, headRef: 'feature-x' })] })
    const { result } = renderHook(() => useActiveBranchPr())
    expect(result.current).toBeUndefined()
  })

  it('returns the open PR matching the HEAD branch', () => {
    usePullRequestsMock.mockReturnValue({
      allPrs: [pr({ number: 9, headRef: 'feature-x', state: 'open' })],
    })
    const { result } = renderHook(() => useActiveBranchPr())
    expect(result.current).toMatchObject({ number: 9, state: 'open' })
  })

  it('falls back to a merged PR when there is no live PR', () => {
    useMergedPrsByBranchMock.mockReturnValue(
      new Map([['feature-x', pr({ number: 3, state: 'merged' })]])
    )
    const { result } = renderHook(() => useActiveBranchPr())
    expect(result.current).toMatchObject({ number: 3, state: 'merged' })
  })

  it('prefers an open PR over a merged one on the same branch', () => {
    usePullRequestsMock.mockReturnValue({
      allPrs: [pr({ number: 9, headRef: 'feature-x', state: 'open' })],
    })
    useMergedPrsByBranchMock.mockReturnValue(
      new Map([['feature-x', pr({ number: 3, state: 'merged' })]])
    )
    const { result } = renderHook(() => useActiveBranchPr())
    expect(result.current).toMatchObject({ number: 9, state: 'open' })
  })

  it('prefers a merged PR over a lingering draft on the same branch', () => {
    usePullRequestsMock.mockReturnValue({
      allPrs: [pr({ number: 9, headRef: 'feature-x', state: 'draft' })],
    })
    useMergedPrsByBranchMock.mockReturnValue(
      new Map([['feature-x', pr({ number: 3, state: 'merged' })]])
    )
    const { result } = renderHook(() => useActiveBranchPr())
    expect(result.current).toMatchObject({ number: 3, state: 'merged' })
  })
})
