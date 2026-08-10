import { describe, it, expect, vi, beforeEach } from 'vitest'

const findLocalRepoPath = vi.hoisted(() => vi.fn())
vi.mock('./findLocalRepo', () => ({
  findLocalRepoPath: (...a: unknown[]) => findLocalRepoPath(...a),
}))

import { routeNotification } from './notificationRouting'
import { useLaunchpadStore } from '../../features/launchpad/stores/launchpad.store'
import { useNotificationStore, type AppNotification } from '../../stores/notification.store'
import { useRepoDataStore } from '../../stores/repoData.store'
import {
  useRepoUIStore,
  DASHBOARD_TAB,
  PULL_REQUESTS_TAB,
  REWARDS_TAB,
} from '../../stores/repoUI.store'
import { useRepoViewStore } from '../../stores/repoView.store'
import type { NotificationRoute } from './notificationRoute'

const PR_ROUTE: NotificationRoute = {
  kind: 'pull-request',
  notificationId: 7,
  prNumber: 42,
  prId: 'pr-42',
  repo: 'git-manager',
  fullName: 'Tlahey/git-manager',
  targetTab: 'waiting',
}

function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 7,
    type: 'pr_merged',
    repo: 'git-manager',
    prNumber: 42,
    prTitle: 'feat: add thing',
    prId: 'pr-42',
    author: 'antoine',
    createdAt: 0,
    read: false,
    targetTab: 'waiting',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  findLocalRepoPath.mockResolvedValue(null)
  useRepoUIStore.setState({
    activeTab: DASHBOARD_TAB,
    activeRepo: null,
    openTabs: [],
    activePrNumber: null,
    activeDiffFile: null,
    aiPanelTarget: null,
  })
  useRepoViewStore.setState({ view: 'graph' })
  useLaunchpadStore.setState({ activeTab: 'prs', pendingOpenPrId: null })
  useNotificationStore.setState({ notifications: [notification()] })
  useRepoDataStore.setState({ savedRepos: [], recentRepoPaths: [] })
})

describe('routeNotification — pull request', () => {
  it('opens the PR in its repo tab when the repo is cloned locally', async () => {
    findLocalRepoPath.mockResolvedValue('/code/git-manager')

    await routeNotification(PR_ROUTE)

    expect(useRepoUIStore.getState().activeTab).toBe('/code/git-manager')
    expect(useRepoUIStore.getState().activeRepo).toBe('/code/git-manager')
    expect(useRepoUIStore.getState().activePrNumber).toBe(42)
  })

  // Every "open this repo in a tab" entry point records recency; a notification click is one.
  // `markRepoOpened` only tracks recency for saved repos, so the repo must be seeded as one.
  it('records the repo as recently opened', async () => {
    findLocalRepoPath.mockResolvedValue('/code/git-manager')
    useRepoDataStore.setState({
      savedRepos: [{ path: '/code/git-manager', name: 'git-manager', pinned: false }],
    })

    await routeNotification(PR_ROUTE)
    expect(useRepoDataStore.getState().recentRepoPaths[0]).toBe('/code/git-manager')
  })

  it('falls back to the Launchpad tab the notification belongs to when there is no local clone', async () => {
    await routeNotification(PR_ROUTE)

    expect(useRepoUIStore.getState().activeTab).toBe(PULL_REQUESTS_TAB)
    expect(useLaunchpadStore.getState().activeTab).toBe('waiting')
    expect(useRepoUIStore.getState().activePrNumber).toBeNull()
  })

  it('asks the Launchpad to open the PR panel on the fallback path', async () => {
    await routeNotification(PR_ROUTE)
    expect(useLaunchpadStore.getState().pendingOpenPrId).toBe('pr-42')
  })

  it('marks the bell entry read', async () => {
    await routeNotification(PR_ROUTE)
    expect(useNotificationStore.getState().notifications[0].read).toBe(true)
  })

  it('routes a notification that has no bell entry without throwing', async () => {
    const { notificationId: _omitted, ...withoutId } = PR_ROUTE
    await expect(routeNotification(withoutId)).resolves.toBeUndefined()
    expect(useNotificationStore.getState().notifications[0].read).toBe(false)
  })

  // The PR page is drawn by the graph view alone. Left on the board, the click would set
  // `activePrNumber` under a screen that renders neither it nor anything else about the PR.
  it('brings the content view forward when the tab was left on the board', async () => {
    findLocalRepoPath.mockResolvedValue('/code/git-manager')
    useRepoViewStore.setState({ view: 'board' })

    await routeNotification(PR_ROUTE)

    expect(useRepoViewStore.getState().view).toBe('graph')
    expect(useRepoUIStore.getState().activePrNumber).toBe(42)
  })

  // The Launchpad is a tab of its own, not a repo view: switching the repo view underneath it would
  // silently discard whichever view the user's repo tab was on.
  it('leaves the repo view alone on the no-local-clone fallback', async () => {
    useRepoViewStore.setState({ view: 'board' })

    await routeNotification(PR_ROUTE)

    expect(useRepoUIStore.getState().activeTab).toBe(PULL_REQUESTS_TAB)
    expect(useRepoViewStore.getState().view).toBe('board')
  })

  it('looks the repo up by fullName and name together', async () => {
    await routeNotification(PR_ROUTE)
    expect(findLocalRepoPath).toHaveBeenCalledWith(
      { fullName: 'Tlahey/git-manager', name: 'git-manager' },
      []
    )
  })
})

describe('routeNotification — rewards', () => {
  it('opens the Rewards tab for an unlocked trophy', async () => {
    await routeNotification({ kind: 'rewards' })
    expect(useRepoUIStore.getState().activeTab).toBe(REWARDS_TAB)
  })

  it('does not look for a repo', async () => {
    await routeNotification({ kind: 'rewards' })
    expect(findLocalRepoPath).not.toHaveBeenCalled()
  })
})

describe('routeNotification — ai-run', () => {
  it('opens the repository and the panel the generation came from', async () => {
    await routeNotification({
      kind: 'ai-run',
      repoPath: '/repo',
      panel: { kind: 'working' },
    })

    const ui = useRepoUIStore.getState()
    expect(ui.activeTab).toBe('/repo')
    expect(ui.aiPanelTarget).toEqual({ kind: 'working' })
  })

  it('clears the centre slot’s other claimants, so the panel isn’t hidden behind a diff', async () => {
    // The same handoff the AI menu performs — otherwise the panel reopens behind whatever the user
    // has since opened, which makes the card look broken exactly when it is doing its job.
    useRepoUIStore.setState({
      activeDiffFile: { path: 'src/a.ts', staged: false },
      activePrNumber: 42,
    })

    await routeNotification({ kind: 'ai-run', repoPath: '/repo', panel: { kind: 'working' } })

    expect(useRepoUIStore.getState().activeDiffFile).toBeNull()
    expect(useRepoUIStore.getState().activePrNumber).toBeNull()
  })

  // The AI panels are part of the graph's centre slot, so the board has nowhere to draw one at all.
  it('brings the content view forward for the panel', async () => {
    useRepoViewStore.setState({ view: 'board' })

    await routeNotification({ kind: 'ai-run', repoPath: '/repo', panel: { kind: 'working' } })

    expect(useRepoViewStore.getState().view).toBe('graph')
  })

  it('just opens the repository when the run named no panel', async () => {
    useRepoViewStore.setState({ view: 'board' })

    await routeNotification({ kind: 'ai-run', repoPath: '/repo' })

    expect(useRepoUIStore.getState().activeTab).toBe('/repo')
    expect(useRepoUIStore.getState().aiPanelTarget).toBeNull()
    // Nothing to reveal, so nothing is taken away either.
    expect(useRepoViewStore.getState().view).toBe('board')
  })

  it('does not look for a repo — the run already knew its path', async () => {
    await routeNotification({ kind: 'ai-run', repoPath: '/repo' })
    expect(findLocalRepoPath).not.toHaveBeenCalled()
  })
})

describe('routeNotification — app', () => {
  // The route for a card about the app's own work: a finished search, a rejected push. The window
  // has already been brought forward by the time this runs, and that was the entire intent.
  it('navigates nowhere, leaving the user where they were', async () => {
    useRepoUIStore.setState({ activeTab: DASHBOARD_TAB })
    await routeNotification({ kind: 'app' })
    expect(useRepoUIStore.getState().activeTab).toBe(DASHBOARD_TAB)
  })

  it('does not look for a repo either', async () => {
    await routeNotification({ kind: 'app' })
    expect(findLocalRepoPath).not.toHaveBeenCalled()
  })
})
