import { describe, it, expect, vi, beforeEach } from 'vitest'

const findLocalRepoPath = vi.hoisted(() => vi.fn())
vi.mock('./findLocalRepo', () => ({
  findLocalRepoPath: (...a: unknown[]) => findLocalRepoPath(...a),
}))

import { routeNotification } from './notificationRouting'
import { useLaunchpadStore } from '../../stores/launchpad.store'
import { useNotificationStore, type AppNotification } from '../../stores/notification.store'
import { useRepoDataStore } from '../../stores/repoData.store'
import {
  useRepoUIStore,
  DASHBOARD_TAB,
  PULL_REQUESTS_TAB,
  REWARDS_TAB,
} from '../../stores/repoUI.store'
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
  useRepoUIStore.setState({ activeTab: DASHBOARD_TAB, activeRepo: null, openTabs: [], activePrNumber: null })
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
    const { notificationId: _omitted, ...withoutId } = PR_ROUTE as Extract<
      NotificationRoute,
      { kind: 'pull-request' }
    >
    await expect(routeNotification(withoutId)).resolves.toBeUndefined()
    expect(useNotificationStore.getState().notifications[0].read).toBe(false)
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
