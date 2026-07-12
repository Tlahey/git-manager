import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { MockPR, MockIssue, DayCommit } from '../app/pull-requests/types'

const useGitHubData = vi.fn()
vi.mock('./useGitHubData', () => ({ useGitHubData: () => useGitHubData() }))

import { useLaunchpadStore } from '../stores/launchpad.store'
import { usePullRequestsPage } from './usePullRequestsPage'

const INITIAL_FILTERS = useLaunchpadStore.getState().savedFilters

function pr(overrides: Partial<MockPR> = {}): MockPR {
  return {
    id: 'pr-1',
    number: 1,
    title: 'Add feature',
    repo: 'repo',
    repoUrl: '',
    url: '',
    status: 'open',
    ciStatus: null,
    author: 'me',
    authorAvatar: '',
    collaborators: [],
    filesChanged: 1,
    additions: 1,
    deletions: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    reviewStatus: 'pending',
    isDraft: false,
    needsMyReview: false,
    labels: [],
    comments: 0,
    ...overrides,
  }
}

function issue(overrides: Partial<MockIssue> = {}): MockIssue {
  return {
    id: 'issue-1',
    number: 1,
    title: 'Bug',
    repo: 'repo',
    url: '',
    status: 'open',
    author: 'me',
    authorAvatar: '',
    assignees: [],
    labels: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    comments: 0,
    ...overrides,
  }
}

function mockGitHubData(overrides: Partial<ReturnType<typeof useGitHubData>> = {}) {
  useGitHubData.mockReturnValue({
    prs: [],
    issues: [],
    commitDays: [] as DayCommit[],
    yearDays: [],
    loading: false,
    isValidating: false,
    error: null,
    hasToken: true,
    username: 'me',
    lastRefreshed: null,
    refresh: vi.fn(),
    ...overrides,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  useLaunchpadStore.setState({ savedFilters: INITIAL_FILTERS, activeTab: 'prs' })
  mockGitHubData()
})

describe('usePullRequestsPage — derived counts', () => {
  it('counts open PRs (open + draft) for openPRsCount', () => {
    mockGitHubData({
      prs: [pr({ status: 'open' }), pr({ status: 'draft' }), pr({ status: 'merged' })],
    })
    const { result } = renderHook(() => usePullRequestsPage())
    expect(result.current.openPRsCount).toBe(2)
  })

  it('counts PRs needing my review', () => {
    mockGitHubData({ prs: [pr({ needsMyReview: true }), pr({ needsMyReview: false })] })
    const { result } = renderHook(() => usePullRequestsPage())
    expect(result.current.needsReviewCount).toBe(1)
  })

  it('counts open issues', () => {
    mockGitHubData({ issues: [issue({ status: 'open' }), issue({ status: 'closed' })] })
    const { result } = renderHook(() => usePullRequestsPage())
    expect(result.current.openIssuesCount).toBe(1)
  })

  it('computes ciPassRate as a rounded percentage', () => {
    mockGitHubData({
      prs: [pr({ ciStatus: 'success' }), pr({ ciStatus: 'failure' }), pr({ ciStatus: 'success' })],
    })
    const { result } = renderHook(() => usePullRequestsPage())
    expect(result.current.ciPassRate).toBe(67)
  })

  it('ciPassRate is 0 when there are no PRs', () => {
    const { result } = renderHook(() => usePullRequestsPage())
    expect(result.current.ciPassRate).toBe(0)
  })

  it('sums the last 7 days of commits for weekCommits', () => {
    const commitDays: DayCommit[] = Array.from({ length: 10 }, (_, i) => ({
      date: `d${i}`,
      commits: i,
    }))
    mockGitHubData({ commitDays })
    const { result } = renderHook(() => usePullRequestsPage())
    // last 7 entries: commits 3..9 = 3+4+5+6+7+8+9 = 42
    expect(result.current.weekCommits).toBe(42)
  })

  it('derives tabCounts, excluding closed/merged from the prs tab', () => {
    mockGitHubData({
      prs: [pr({ status: 'open' }), pr({ status: 'merged' }), pr({ status: 'closed' })],
      issues: [issue({ status: 'open' })],
    })
    const { result } = renderHook(() => usePullRequestsPage())
    expect(result.current.tabCounts.prs).toBe(1)
    expect(result.current.tabCounts.issues).toBe(1)
    expect(result.current.tabCounts.stats).toBeUndefined()
    expect(result.current.tabCounts.views).toBe(INITIAL_FILTERS.length)
  })
})

describe('usePullRequestsPage — pinning and following', () => {
  it('togglePin adds then removes an id', () => {
    const { result } = renderHook(() => usePullRequestsPage())
    act(() => result.current.togglePin('pr-1'))
    expect(result.current.pinnedIds.has('pr-1')).toBe(true)
    act(() => result.current.togglePin('pr-1'))
    expect(result.current.pinnedIds.has('pr-1')).toBe(false)
  })

  it('addFollowed appends a PR without duplicating it', () => {
    const { result } = renderHook(() => usePullRequestsPage())
    act(() => result.current.addFollowed(pr({ id: 'pr-1' })))
    act(() => result.current.addFollowed(pr({ id: 'pr-1' })))
    expect(result.current.followedPRs).toHaveLength(1)
  })

  it('removeFollowed removes only the matching PR', () => {
    const { result } = renderHook(() => usePullRequestsPage())
    act(() => result.current.addFollowed(pr({ id: 'pr-1' })))
    act(() => result.current.addFollowed(pr({ id: 'pr-2' })))
    act(() => result.current.removeFollowed('pr-1'))
    expect(result.current.followedPRs.map((p) => p.id)).toEqual(['pr-2'])
  })

  it('followedPRs.length feeds tabCounts.followed', () => {
    const { result } = renderHook(() => usePullRequestsPage())
    act(() => result.current.addFollowed(pr({ id: 'pr-1' })))
    expect(result.current.tabCounts.followed).toBe(1)
  })
})
