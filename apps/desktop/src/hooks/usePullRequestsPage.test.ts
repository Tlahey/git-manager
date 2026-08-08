import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { MockPR, MockIssue, DayCommit } from '../app/pull-requests/types'

const useGitHubData = vi.fn()
vi.mock('./useGitHubData', () => ({ useGitHubData: () => useGitHubData() }))

const useGitHubRepoIssues = vi.fn()
vi.mock('./useGitHubRepoIssues', () => ({ useGitHubRepoIssues: () => useGitHubRepoIssues() }))

import { useLaunchpadStore } from '../stores/launchpad.store'
import { useDevFlagsStore, DEV_FLAG_DEFAULTS } from '../stores/devFlags.store'
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
    thumbsUp: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    comments: 0,
    ...overrides,
  }
}

function mockGitHubData(overrides: Partial<ReturnType<typeof useGitHubData>> = {}) {
  useGitHubData.mockReturnValue({
    prs: [],
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

function mockRepoIssues(issues: MockIssue[] = []) {
  useGitHubRepoIssues.mockReturnValue({
    issues,
    loading: false,
    isValidating: false,
    error: null,
    refresh: vi.fn(),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  useLaunchpadStore.setState({
    savedFilters: INITIAL_FILTERS,
    activeTab: 'prs',
    snoozed: {},
    connectBannerDismissed: false,
  })
  useDevFlagsStore.setState({ mockGitHub: DEV_FLAG_DEFAULTS.mockGitHub })
  mockGitHubData()
  mockRepoIssues()
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

  it('counts my open issues, ignoring closed and other people’s', () => {
    mockRepoIssues([
      issue({ id: 'i1', author: 'me', status: 'open' }),
      issue({ id: 'i2', author: 'me', status: 'closed' }),
      issue({ id: 'i3', author: 'someone-else', status: 'open' }),
    ])
    const { result } = renderHook(() => usePullRequestsPage())
    // Every added-repo issue is exposed, but the count reflects the default "mine + open" view.
    expect(result.current.issues.map((i) => i.id)).toEqual(['i1', 'i2', 'i3'])
    expect(result.current.openIssuesCount).toBe(1)
  })

  it('counts an issue assigned to me even when authored by someone else', () => {
    mockRepoIssues([
      issue({
        id: 'i1',
        author: 'someone-else',
        status: 'open',
        assignees: [{ login: 'me', avatar: '' }],
      }),
    ])
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
    })
    mockRepoIssues([issue({ author: 'me', status: 'open' })])
    const { result } = renderHook(() => usePullRequestsPage())
    expect(result.current.tabCounts.prs).toBe(1)
    expect(result.current.tabCounts.issues).toBe(1)
    expect(result.current.tabCounts.stats).toBeUndefined()
    expect(result.current.tabCounts.views).toBe(INITIAL_FILTERS.length)
  })
})

describe('usePullRequestsPage — snooze', () => {
  it('moves snoozed PRs out of the visible list and into snoozedPRs', () => {
    useLaunchpadStore.setState({ snoozed: { 'pr-a': null } })
    mockGitHubData({ prs: [pr({ id: 'pr-a' }), pr({ id: 'pr-b' })] })
    const { result } = renderHook(() => usePullRequestsPage())
    expect(result.current.visiblePRs.map((p) => p.id)).toEqual(['pr-b'])
    expect(result.current.snoozedPRs.map((p) => p.id)).toEqual(['pr-a'])
    expect(result.current.tabCounts.snoozed).toBe(1)
  })

  it('excludes snoozed PRs from the derived counts', () => {
    useLaunchpadStore.setState({ snoozed: { 'pr-a': null } })
    mockGitHubData({
      prs: [pr({ id: 'pr-a', status: 'open' }), pr({ id: 'pr-b', status: 'open' })],
    })
    const { result } = renderHook(() => usePullRequestsPage())
    expect(result.current.openPRsCount).toBe(1)
    expect(result.current.tabCounts.prs).toBe(1)
  })

  it('treats an expired snooze as woken', () => {
    useLaunchpadStore.setState({ snoozed: { 'pr-a': Date.now() - 1000 } })
    mockGitHubData({ prs: [pr({ id: 'pr-a' })] })
    const { result } = renderHook(() => usePullRequestsPage())
    expect(result.current.visiblePRs.map((p) => p.id)).toEqual(['pr-a'])
    expect(result.current.snoozedPRs).toHaveLength(0)
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

// `githubConnected` is what hides the page's GitHub half, and it is deliberately *not* `hasToken`:
// the dev fixture flag exists so a build with no account still renders the populated page, and
// hiding the tabs from it would empty the e2e run and the documentation screenshots with it.
describe('usePullRequestsPage — githubConnected', () => {
  it('is true with a real account, and reports the data as real', () => {
    useDevFlagsStore.setState({ mockGitHub: false })
    mockGitHubData({ hasToken: true })
    const { result } = renderHook(() => usePullRequestsPage())
    expect(result.current.githubConnected).toBe(true)
    expect(result.current.isMocked).toBe(false)
  })

  it('is false with neither an account nor the fixture flag', () => {
    useDevFlagsStore.setState({ mockGitHub: false })
    mockGitHubData({ hasToken: false })
    const { result } = renderHook(() => usePullRequestsPage())
    expect(result.current.githubConnected).toBe(false)
    expect(result.current.isMocked).toBe(false)
  })

  it('is true on the fixture flag alone, and says the data is invented', () => {
    useDevFlagsStore.setState({ mockGitHub: true })
    mockGitHubData({ hasToken: false })
    const { result } = renderHook(() => usePullRequestsPage())
    expect(result.current.githubConnected).toBe(true)
    expect(result.current.isMocked).toBe(true)
  })
})

// The strip explains an absence that lasts until the user acts on it, so re-raising it on every
// visit would nag rather than inform — but a dismissal must not silence it forever either.
describe('usePullRequestsPage — the connect banner', () => {
  function signedOut() {
    useDevFlagsStore.setState({ mockGitHub: false })
    mockGitHubData({ hasToken: false })
  }

  it('is shown while signed out and never seen off', () => {
    signedOut()
    const { result } = renderHook(() => usePullRequestsPage())
    expect(result.current.showConnectBanner).toBe(true)
  })

  it('stays hidden once dismissed, across a remount', () => {
    signedOut()
    const { result, unmount } = renderHook(() => usePullRequestsPage())
    act(() => result.current.dismissConnectBanner())
    expect(result.current.showConnectBanner).toBe(false)

    // Leaving the Launchpad and coming back must not raise it again — that is the whole point of
    // persisting the flag rather than holding it in the component.
    unmount()
    const { result: revisited } = renderHook(() => usePullRequestsPage())
    expect(revisited.current.showConnectBanner).toBe(false)
  })

  it('has nothing to show once an account is connected', () => {
    useDevFlagsStore.setState({ mockGitHub: false })
    mockGitHubData({ hasToken: true })
    const { result } = renderHook(() => usePullRequestsPage())
    expect(result.current.showConnectBanner).toBe(false)
  })

  // A dismissal silences the current signed-out spell, not the next one.
  it('re-arms itself when an account is connected, so a later sign-out explains itself again', () => {
    signedOut()
    const { result, unmount } = renderHook(() => usePullRequestsPage())
    act(() => result.current.dismissConnectBanner())
    unmount()

    // Connect: the flag is cleared even though the banner is not rendered in this state.
    mockGitHubData({ hasToken: true })
    const connected = renderHook(() => usePullRequestsPage())
    expect(useLaunchpadStore.getState().connectBannerDismissed).toBe(false)
    connected.unmount()

    signedOut()
    const { result: signedOutAgain } = renderHook(() => usePullRequestsPage())
    expect(signedOutAgain.current.showConnectBanner).toBe(true)
  })
})
