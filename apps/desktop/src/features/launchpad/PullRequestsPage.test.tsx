import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MockPR, MockIssue } from '../../lib/github/types'

vi.mock('@tauri-apps/plugin-shell', () => ({ open: vi.fn() }))

const { usePullRequestsPage } = vi.hoisted(() => ({ usePullRequestsPage: vi.fn() }))
vi.mock('./hooks/usePullRequestsPage', () => ({ usePullRequestsPage }))

const { notify } = vi.hoisted(() => ({ notify: vi.fn() }))
vi.mock('../../lib/appEventBus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/appEventBus')>()
  return { ...actual, appEventBus: { ...actual.appEventBus, notify } }
})

import { PullRequestsPage } from './PullRequestsPage'
import { useLaunchpadStore } from './stores/launchpad.store'

const INITIAL_LAUNCHPAD_STATE = useLaunchpadStore.getState()

function pr(overrides: Partial<MockPR> = {}): MockPR {
  return {
    id: overrides.id ?? Math.random().toString(),
    number: 1,
    title: 'A pull request',
    repo: 'repo-a',
    repoUrl: 'x',
    url: 'https://x/pull/1',
    status: 'open',
    ciStatus: null,
    author: 'alice',
    authorAvatar: 'x',
    collaborators: [],
    filesChanged: 0,
    additions: 0,
    deletions: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    reviewStatus: 'pending',
    isDraft: false,
    labels: [],
    comments: 0,
    ...overrides,
  }
}

function issue(overrides: Partial<MockIssue> = {}): MockIssue {
  return {
    id: overrides.id ?? Math.random().toString(),
    number: 1,
    title: 'An issue',
    repo: 'repo-a',
    url: 'https://x/issues/1',
    status: 'open',
    author: 'alice',
    authorAvatar: 'x',
    assignees: [],
    labels: [],
    thumbsUp: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    comments: 0,
    ...overrides,
  }
}

function mockHook(overrides: Partial<ReturnType<typeof usePullRequestsPage>> = {}) {
  const base = {
    activeTab: 'prs',
    setActiveTab: vi.fn(),
    prs: [] as MockPR[],
    visiblePRs: [] as MockPR[],
    snoozedPRs: [] as MockPR[],
    issues: [] as MockIssue[],
    issuesLoading: false,
    refreshIssues: vi.fn(),
    commitDays: [],
    yearDays: [],
    loading: false,
    isValidating: false,
    error: null,
    hasToken: true,
    // The page's GitHub half is on by default here; the signed-out suite flips these.
    githubConnected: true,
    showConnectBanner: false,
    dismissConnectBanner: vi.fn(),
    isMocked: false,
    username: 'octocat',
    lastRefreshed: null,
    refresh: vi.fn(),
    pinnedIds: new Set<string>(),
    togglePin: vi.fn(),
    followedPRs: [] as MockPR[],
    addFollowed: vi.fn(),
    removeFollowed: vi.fn(),
    openPRsCount: 0,
    needsReviewCount: 0,
    openIssuesCount: 0,
    ciPassRate: 0,
    weekCommits: 0,
    tabCounts: {
      prs: 0,
      wip: 0,
      followed: 0,
      issues: 0,
      waiting: 0,
      snoozed: 0,
      stats: undefined,
      views: undefined,
    },
    ...overrides,
  }
  usePullRequestsPage.mockReturnValue(base)
  return base
}

beforeEach(() => {
  vi.clearAllMocks()
  useLaunchpadStore.setState(INITIAL_LAUNCHPAD_STATE, true)
  mockHook()
})

describe('PullRequestsPage — header sync status', () => {
  it('shows "Fetching…" while loading', () => {
    mockHook({ loading: true })
    render(<PullRequestsPage />)
    expect(screen.getByText('Fetching…')).toBeInTheDocument()
  })

  it('shows the synced username when loaded successfully', () => {
    mockHook({ loading: false, isValidating: false, error: null, username: 'octocat' })
    render(<PullRequestsPage />)
    expect(screen.getByText('octocat')).toBeInTheDocument()
    expect(screen.getByText(/Synced as/)).toBeInTheDocument()
  })

  it('shows the error message when there is a sync error', () => {
    mockHook({ loading: false, isValidating: false, error: 'Rate limited' })
    render(<PullRequestsPage />)
    expect(screen.getByText('Rate limited')).toBeInTheDocument()
  })

  // Being signed out is not a fault worth an amber pill in the title bar: the connect banner below
  // already says it *and* says what to do about it, and two notices for one fact left the header
  // shouting about a state the user had chosen. Only invented data still warrants a warning here.
  it('says nothing in the header about a missing account', () => {
    mockHook({ hasToken: false, githubConnected: false, showConnectBanner: true })
    render(<PullRequestsPage />)
    expect(screen.queryByText(/No GitHub account/)).not.toBeInTheDocument()
    // The guidance is not lost — it moved to the one place that can act on it.
    expect(screen.getByTestId('launchpad-connect-github')).toBeInTheDocument()
  })

  it('drops the divider with it, rather than leaving a rule beside the title', () => {
    const { container } = render(<PullRequestsPage />)
    const withStatus = container.querySelectorAll('header .w-px').length

    mockHook({ hasToken: false, githubConnected: false })
    const { container: signedOut } = render(<PullRequestsPage />)
    expect(withStatus).toBe(1)
    expect(signedOut.querySelectorAll('header .w-px')).toHaveLength(0)
  })

  it('shows the last-refreshed time when present', () => {
    mockHook({ lastRefreshed: new Date(Date.now() - 5000) })
    render(<PullRequestsPage />)
    expect(screen.getByText(/ago/)).toBeInTheDocument()
  })

  it('hides the last-refreshed time when absent', () => {
    mockHook({ lastRefreshed: null })
    render(<PullRequestsPage />)
    expect(screen.queryByText(/ago/)).not.toBeInTheDocument()
  })
})

describe('PullRequestsPage — refresh button', () => {
  it('calls refresh() on click', async () => {
    const refresh = vi.fn()
    const user = userEvent.setup()
    mockHook({ refresh })
    render(<PullRequestsPage />)
    await user.click(screen.getByTestId('manual-refresh-button'))
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('disables the refresh button while isValidating', () => {
    mockHook({ isValidating: true })
    render(<PullRequestsPage />)
    expect(screen.getByTestId('manual-refresh-button')).toBeDisabled()
  })

  it('shows the shimmer progress bar while isValidating', () => {
    mockHook({ isValidating: true })
    const { container } = render(<PullRequestsPage />)
    expect(container.querySelector('.animate-shimmer')).toBeTruthy()
  })

  it('hides the shimmer progress bar when not validating', () => {
    mockHook({ isValidating: false })
    const { container } = render(<PullRequestsPage />)
    expect(container.querySelector('.animate-shimmer')).toBeFalsy()
  })
})

describe('PullRequestsPage — KPI bar', () => {
  it('shows all 5 KPI values', () => {
    mockHook({
      openPRsCount: 3,
      needsReviewCount: 2,
      openIssuesCount: 4,
      ciPassRate: 87,
      weekCommits: 12,
    })
    render(<PullRequestsPage />)
    expect(screen.getByText('Open PRs')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Needs review')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Open issues')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('87%')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })
})

describe('PullRequestsPage — tab navigation', () => {
  it('renders the My Pull Requests tab content by default and lists PRs', () => {
    mockHook({ activeTab: 'prs', visiblePRs: [pr({ title: 'Default tab PR' })] })
    render(<PullRequestsPage />)
    expect(screen.getByText('Default tab PR')).toBeInTheDocument()
  })

  it('switches tabs via setActiveTab when a different tab is clicked', async () => {
    const setActiveTab = vi.fn()
    const user = userEvent.setup()
    mockHook({ setActiveTab })
    render(<PullRequestsPage />)
    await user.click(screen.getByText('My Issues'))
    expect(setActiveTab).toHaveBeenCalledWith('issues')
  })

  it('renders the Issues tab content when activeTab is "issues"', () => {
    // Authored by the signed-in user so the Issues tab's default "Mine" filter keeps it visible.
    mockHook({
      activeTab: 'issues',
      issues: [issue({ title: 'An assigned issue', author: 'octocat' })],
    })
    render(<PullRequestsPage />)
    expect(screen.getByText('An assigned issue')).toBeInTheDocument()
  })

  it('renders the Commit Stats tab content when activeTab is "stats"', () => {
    mockHook({ activeTab: 'stats', commitDays: [{ date: '2024-01-01', commits: 3 }], yearDays: [] })
    render(<PullRequestsPage />)
    expect(screen.getByText('Total commits')).toBeInTheDocument()
  })

  it('notifies the "view_waiting_reviews" app event when the Waiting for Review tab is clicked', async () => {
    const user = userEvent.setup()
    mockHook()
    render(<PullRequestsPage />)
    await user.click(screen.getByText('Waiting for Review'))
    expect(notify).toHaveBeenCalledWith('view_waiting_reviews')
  })

  it('does not notify view_waiting_reviews for other tabs', async () => {
    const user = userEvent.setup()
    mockHook()
    render(<PullRequestsPage />)
    await user.click(screen.getByText('My Issues'))
    expect(notify).not.toHaveBeenCalled()
  })

  it('shows per-tab counts from tabCounts', () => {
    mockHook({
      tabCounts: {
        prs: 5,
        wip: 0,
        followed: 0,
        issues: 2,
        waiting: 1,
        snoozed: 0,
        stats: undefined,
        views: undefined,
      },
    })
    const { container } = render(<PullRequestsPage />)
    const tabBar = container.querySelector(
      '.flex.items-center.border-b.border-border.bg-card\\/30'
    )!
    expect(tabBar.textContent).toContain('5')
    expect(tabBar.textContent).toContain('2')
  })
})

describe('PullRequestsPage — opening a PR in the in-app view', () => {
  it('opens the interactive PR view in a resizable side panel via open-in-app button, then closes via Back', async () => {
    const user = userEvent.setup()
    mockHook({
      activeTab: 'prs',
      visiblePRs: [pr({ id: 'pr-1', title: 'Openable PR', fullName: 'owner/repo' })],
    })
    render(<PullRequestsPage />)

    await user.click(screen.getByTestId('pr-open-in-app-pr-1'))
    expect(screen.getByTestId('launchpad-pr-panel')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByTestId('launchpad-pr-view')).toBeInTheDocument()
    // The list stays mounted alongside the panel (no full-page takeover) — inert while the modal
    // is up, but never unmounted, so closing returns to it in place.
    expect(screen.getByText('Openable PR')).toBeInTheDocument()

    await user.click(screen.getByTestId('pr-detail-back'))
    expect(screen.queryByTestId('launchpad-pr-panel')).not.toBeInTheDocument()
    expect(screen.getByText('Openable PR')).toBeInTheDocument()
  })

  it("opens the panel from the row's open-in-app icon", async () => {
    const user = userEvent.setup()
    mockHook({
      activeTab: 'prs',
      visiblePRs: [pr({ id: 'pr-x', title: 'Iconable PR', fullName: 'owner/repo' })],
    })
    render(<PullRequestsPage />)

    await user.click(screen.getByTestId('pr-open-in-app-pr-x'))
    expect(screen.getByTestId('launchpad-pr-panel')).toBeInTheDocument()
  })
})

describe('PullRequestsPage — pin toggling forwarded to a tab', () => {
  it('forwards togglePin from the My Pull Requests tab', async () => {
    const togglePin = vi.fn()
    const user = userEvent.setup()
    mockHook({ activeTab: 'prs', visiblePRs: [pr({ id: 'pr-1' })], togglePin })
    render(<PullRequestsPage />)
    await user.click(screen.getByTitle('Pin'))
    expect(togglePin).toHaveBeenCalledWith('pr-1')
  })
})

// Signed out, the page used to render its whole GitHub apparatus anyway — five KPI cards reading
// zero, a refresh button with nothing to refresh, seven tabs of empty lists — which reads as "there
// is nothing here" when the truth is "the app has not been told whose data to fetch".
describe('PullRequestsPage — no GitHub account connected', () => {
  function renderSignedOut(
    overrides: Partial<ReturnType<typeof usePullRequestsPage>> = {},
    onOpenSettings?: () => void
  ) {
    mockHook({
      hasToken: false,
      githubConnected: false,
      showConnectBanner: true,
      ...overrides,
    })
    return render(<PullRequestsPage onOpenSettings={onOpenSettings} />)
  }

  it('asks the user to connect an account', () => {
    renderSignedOut()
    expect(screen.getByTestId('launchpad-connect-github')).toBeInTheDocument()
    expect(screen.getByText('Connect your GitHub account')).toBeInTheDocument()
  })

  it('hides the KPI bar, the global filter toolbar and the refresh control', () => {
    renderSignedOut({ lastRefreshed: new Date(Date.now() - 5000) })
    expect(screen.queryByText('Open PRs')).not.toBeInTheDocument()
    expect(screen.queryByTestId('launchpad-toolbar')).not.toBeInTheDocument()
    expect(screen.queryByTestId('manual-refresh-button')).not.toBeInTheDocument()
    expect(screen.queryByText(/ago/)).not.toBeInTheDocument()
  })

  it('keeps only the local WIP tab, which needs no account', () => {
    renderSignedOut()
    expect(screen.getByTestId('launchpad-tab-wip')).toBeInTheDocument()
    for (const id of ['prs', 'followed', 'issues', 'waiting', 'snoozed', 'stats', 'views']) {
      expect(screen.queryByTestId(`launchpad-tab-${id}`)).not.toBeInTheDocument()
    }
  })

  // The active tab is persisted, so a user who signs out (or whose store outlived an account)
  // would otherwise land on a tab that is no longer in the bar and see a blank page.
  it('falls back to the WIP tab when the persisted one is GitHub-backed', () => {
    renderSignedOut({ activeTab: 'prs' })
    expect(screen.getByTestId('launchpad-tab-wip')).toHaveClass('border-primary')
  })

  it('opens the integration settings from the prompt', async () => {
    const onOpenSettings = vi.fn()
    const user = userEvent.setup()
    renderSignedOut({}, onOpenSettings)
    await user.click(screen.getByTestId('launchpad-connect-github-button'))
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })

  it('closes the prompt through the hook, which is what remembers the dismissal', async () => {
    const dismissConnectBanner = vi.fn()
    const user = userEvent.setup()
    renderSignedOut({ dismissConnectBanner })
    await user.click(screen.getByTestId('launchpad-connect-github-dismiss'))
    expect(dismissConnectBanner).toHaveBeenCalledOnce()
  })

  // Dismissed, the page keeps every other signed-out decision — the point of closing it is to get
  // the row back for the WIP list, not to pretend an account is connected.
  it('drops the prompt once dismissed while still hiding the GitHub half', () => {
    renderSignedOut({ showConnectBanner: false })
    expect(screen.queryByTestId('launchpad-connect-github')).not.toBeInTheDocument()
    expect(screen.getByTestId('launchpad-tab-wip')).toBeInTheDocument()
    expect(screen.queryByTestId('launchpad-tab-prs')).not.toBeInTheDocument()
    expect(screen.queryByText('Open PRs')).not.toBeInTheDocument()
  })

  // The one header warning that survives, because invented pull requests rendered as real ones is
  // a genuine misreading risk — unlike simply having no account, which is a state, not a fault.
  it('warns about demo data when the fixtures are on', () => {
    renderSignedOut({ githubConnected: true, isMocked: true })
    expect(screen.getByText(/showing demo data/)).toBeInTheDocument()
  })

  it('says nothing at all in the header when they are off', () => {
    renderSignedOut({ isMocked: false })
    expect(screen.queryByText(/showing demo data/)).not.toBeInTheDocument()
    expect(screen.queryByText(/No GitHub account/)).not.toBeInTheDocument()
  })
})
