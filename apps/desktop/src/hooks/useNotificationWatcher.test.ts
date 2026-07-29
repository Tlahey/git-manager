import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { MockPR } from '../app/pull-requests/types'
import { i18next, type TFunction } from '@git-manager/i18n'

const useGitHubData = vi.fn()
vi.mock('./useGitHubData', () => ({ useGitHubData: () => useGitHubData() }))

const { sendNativeNotification, onNotificationActivated, unlisten } = vi.hoisted(() => ({
  sendNativeNotification: vi.fn(),
  onNotificationActivated: vi.fn(),
  unlisten: vi.fn(),
}))
vi.mock('../api/notification.api', () => ({
  apiSendNativeNotification: (...a: unknown[]) => sendNativeNotification(...a),
  apiOnNotificationActivated: (...a: unknown[]) => onNotificationActivated(...a),
}))

const routeNotification = vi.hoisted(() => vi.fn())
vi.mock('../lib/notifications/notificationRouting', () => ({
  routeNotification: (...a: unknown[]) => routeNotification(...a),
}))

import { useNotificationStore } from '../stores/notification.store'
import { useSettingsStore } from '../stores/settings.store'
import { useRepoUIStore, DASHBOARD_TAB } from '../stores/repoUI.store'
import { useLaunchpadStore } from '../stores/launchpad.store'
import { useNotificationWatcher, showNativeNotification } from './useNotificationWatcher'

const DEFAULT_SETTINGS = useSettingsStore.getState().settings

function pr(overrides: Partial<MockPR> = {}): MockPR {
  return {
    id: 'pr-1',
    number: 1,
    title: 'Add feature',
    repo: 'org/repo',
    repoUrl: '',
    url: 'https://github.com/org/repo/pull/1',
    status: 'open',
    ciStatus: null,
    author: 'octocat',
    authorAvatar: '',
    collaborators: [],
    filesChanged: 1,
    additions: 1,
    deletions: 0,
    createdAt: new Date(),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    reviewStatus: 'pending',
    isDraft: false,
    needsMyReview: false,
    labels: [],
    comments: 0,
    ...overrides,
  }
}

function mockGitHubData(prs: MockPR[], loading = false) {
  useGitHubData.mockReturnValue({ prs, loading })
}

beforeEach(() => {
  vi.clearAllMocks()
  useNotificationStore.setState({
    notifications: [],
    previousPRs: {},
    hasSessionInitialized: false,
  })
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
  useRepoUIStore.setState({ activeTab: DASHBOARD_TAB })
  useLaunchpadStore.setState({ activeTab: 'prs' })
  sendNativeNotification.mockResolvedValue(undefined)
  onNotificationActivated.mockResolvedValue(unlisten)
  mockGitHubData([])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useNotificationWatcher — click listener setup', () => {
  it('subscribes to notification clicks and unsubscribes on unmount', async () => {
    const { unmount } = renderHook(() => useNotificationWatcher())
    await waitFor(() => expect(onNotificationActivated).toHaveBeenCalled())
    unmount()
    expect(unlisten).toHaveBeenCalledOnce()
  })

  it('hands a clicked notification straight to the router', async () => {
    renderHook(() => useNotificationWatcher())
    await waitFor(() => expect(onNotificationActivated).toHaveBeenCalled())
    const handler = onNotificationActivated.mock.calls[0][0]

    const route = { kind: 'pull-request', prNumber: 1, prId: 'pr-1', repo: 'repo', targetTab: 'waiting' }
    act(() => handler(route))

    expect(routeNotification).toHaveBeenCalledWith(route)
  })

  // Bound unconditionally: a banner raised before the setting was switched off can still be
  // sitting in Notification Centre, and clicking it must not be a no-op.
  it('still subscribes when notifications are disabled', async () => {
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        notifications: { ...DEFAULT_SETTINGS.notifications!, enabled: false },
      },
    })
    renderHook(() => useNotificationWatcher())
    await waitFor(() => expect(onNotificationActivated).toHaveBeenCalled())
  })

  it('does not throw when the listener cannot be bound', async () => {
    onNotificationActivated.mockRejectedValue(new Error('no tauri host'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    renderHook(() => useNotificationWatcher())
    await waitFor(() => expect(warnSpy).toHaveBeenCalled())
    expect(useRepoUIStore.getState().activeTab).toBe(DASHBOARD_TAB)
  })
})

describe('useNotificationWatcher — PR change detection', () => {
  it('establishes the baseline on first load without notifying', async () => {
    mockGitHubData([pr()])
    renderHook(() => useNotificationWatcher())
    await waitFor(() => expect(useNotificationStore.getState().hasSessionInitialized).toBe(true))
    expect(useNotificationStore.getState().notifications).toEqual([])
    expect(useNotificationStore.getState().previousPRs['pr-1']).toMatchObject({ status: 'open' })
  })

  it('does nothing while loading', () => {
    mockGitHubData([pr()], true)
    renderHook(() => useNotificationWatcher())
    expect(useNotificationStore.getState().hasSessionInitialized).toBe(false)
  })

  it('does nothing when there are no PRs', () => {
    mockGitHubData([])
    renderHook(() => useNotificationWatcher())
    expect(useNotificationStore.getState().hasSessionInitialized).toBe(false)
  })

  it('notifies on a detected change after the baseline is established', async () => {
    mockGitHubData([pr({ status: 'open' })])
    const { rerender } = renderHook(() => useNotificationWatcher())
    await waitFor(() => expect(useNotificationStore.getState().hasSessionInitialized).toBe(true))

    mockGitHubData([pr({ status: 'merged' })])
    rerender()

    await waitFor(() => expect(useNotificationStore.getState().notifications).toHaveLength(1))
    expect(useNotificationStore.getState().notifications[0]).toMatchObject({
      type: 'pr_merged',
      prId: 'pr-1',
    })
  })

  it('does not notify when notifications are globally disabled', async () => {
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        notifications: { ...DEFAULT_SETTINGS.notifications!, enabled: false },
      },
    })
    mockGitHubData([pr({ status: 'open' })])
    const { rerender } = renderHook(() => useNotificationWatcher())
    await waitFor(() => expect(useNotificationStore.getState().hasSessionInitialized).toBe(true))

    mockGitHubData([pr({ status: 'merged' })])
    rerender()

    await new Promise((r) => setTimeout(r, 0))
    expect(useNotificationStore.getState().notifications).toEqual([])
  })

  it('updates the baseline snapshot after a detected change', async () => {
    mockGitHubData([pr({ status: 'open' })])
    const { rerender } = renderHook(() => useNotificationWatcher())
    await waitFor(() => expect(useNotificationStore.getState().hasSessionInitialized).toBe(true))

    mockGitHubData([pr({ status: 'merged' })])
    rerender()

    await waitFor(() =>
      expect(useNotificationStore.getState().previousPRs['pr-1'].status).toBe('merged')
    )
  })

  it('advances the baseline even when nothing was notified, so a change is not replayed later', async () => {
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        notifications: { ...DEFAULT_SETTINGS.notifications!, enabled: false },
      },
    })
    mockGitHubData([pr({ status: 'open' })])
    const { rerender } = renderHook(() => useNotificationWatcher())
    await waitFor(() => expect(useNotificationStore.getState().hasSessionInitialized).toBe(true))

    mockGitHubData([pr({ status: 'merged' })])
    rerender()

    await waitFor(() =>
      expect(useNotificationStore.getState().previousPRs['pr-1'].status).toBe('merged')
    )
    expect(useNotificationStore.getState().notifications).toEqual([])
  })

  it('reports a merge as merged only, without the CI change that landed with it', async () => {
    mockGitHubData([pr({ status: 'open', ciStatus: 'running' })])
    const { rerender } = renderHook(() => useNotificationWatcher())
    await waitFor(() => expect(useNotificationStore.getState().hasSessionInitialized).toBe(true))

    mockGitHubData([pr({ status: 'merged', ciStatus: 'failure' })])
    rerender()

    await waitFor(() => expect(useNotificationStore.getState().notifications).toHaveLength(1))
    expect(useNotificationStore.getState().notifications[0].type).toBe('pr_merged')
  })

  it('notifies when a PR is queued to merge', async () => {
    mockGitHubData([pr({ autoMerge: false })])
    const { rerender } = renderHook(() => useNotificationWatcher())
    await waitFor(() => expect(useNotificationStore.getState().hasSessionInitialized).toBe(true))

    mockGitHubData([pr({ autoMerge: true })])
    rerender()

    await waitFor(() => expect(useNotificationStore.getState().notifications).toHaveLength(1))
    expect(useNotificationStore.getState().notifications[0].type).toBe('pr_queued')
  })
})

describe('showNativeNotification', () => {
  const t = i18next.getFixedT('en', 'common') as unknown as TFunction

  it('sends the notification with the prefix for its type and the route back to its PR', async () => {
    const notif = useNotificationStore.getState().addNotification({
      type: 'new_pr',
      repo: 'org/repo',
      fullName: 'org/repo',
      prNumber: 1,
      prTitle: 'Add feature',
      prId: 'pr-1',
      author: 'octocat',
      targetTab: 'prs',
    })

    await showNativeNotification(notif, t)

    expect(sendNativeNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('🆕'),
        route: {
          kind: 'pull-request',
          notificationId: notif.id,
          prNumber: 1,
          prId: 'pr-1',
          repo: 'org/repo',
          fullName: 'org/repo',
          targetTab: 'prs',
        },
      })
    )
  })

  it('omits the sound when sound is disabled in settings', async () => {
    const notif = useNotificationStore.getState().addNotification({
      type: 'new_pr',
      repo: 'org/repo',
      prNumber: 1,
      prTitle: 'Add feature',
      prId: 'pr-1',
      author: 'octocat',
      targetTab: 'prs',
    })

    await showNativeNotification(notif, t)
    expect(sendNativeNotification.mock.calls[0][0]).not.toHaveProperty('sound')
  })

  it('includes the sound name only when sound is enabled in settings', async () => {
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        notifications: { ...DEFAULT_SETTINGS.notifications!, enableSound: true, soundName: 'ding' },
      },
    })
    const notif = useNotificationStore.getState().addNotification({
      type: 'pr_merged',
      repo: 'org/repo',
      prNumber: 1,
      prTitle: 'Add feature',
      prId: 'pr-1',
      author: 'octocat',
      targetTab: 'prs',
    })

    await showNativeNotification(notif, t)
    expect(sendNativeNotification).toHaveBeenCalledWith(expect.objectContaining({ sound: 'ding' }))
  })
})
