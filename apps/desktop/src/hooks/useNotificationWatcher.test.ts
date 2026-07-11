import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { MockPR } from '../app/pull-requests/types'
import type { TFunction } from '@git-manager/i18n'

const useGitHubData = vi.fn()
vi.mock('./useGitHubData', () => ({ useGitHubData: () => useGitHubData() }))

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const { isPermissionGranted, requestPermission, sendNotification, onAction, unregister } = vi.hoisted(() => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
  onAction: vi.fn(),
  unregister: vi.fn(),
}))
vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: (...a: unknown[]) => isPermissionGranted(...a),
  requestPermission: (...a: unknown[]) => requestPermission(...a),
  sendNotification: (...a: unknown[]) => sendNotification(...a),
  onAction: (...a: unknown[]) => onAction(...a),
}))

import { useNotificationStore } from '../stores/notification.store'
import { useSettingsStore } from '../stores/settings.store'
import { useRepoUIStore, PULL_REQUESTS_TAB, DASHBOARD_TAB } from '../stores/repoUI.store'
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
  useNotificationStore.setState({ notifications: [], previousPRs: {}, hasSessionInitialized: false })
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
  useRepoUIStore.setState({ activeTab: DASHBOARD_TAB })
  useLaunchpadStore.setState({ activeTab: 'prs' })
  isPermissionGranted.mockResolvedValue(true)
  requestPermission.mockResolvedValue('granted')
  onAction.mockResolvedValue({ unregister })
  mockGitHubData([])
  // The action handler calls window.focus() unconditionally (even for an unmatched id), and
  // jsdom doesn't implement it — stub it globally to avoid noisy "not implemented" console spam.
  vi.spyOn(window, 'focus').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useNotificationWatcher — permission + action listener setup', () => {
  it('requests permission on mount when notifications are enabled and not yet granted', async () => {
    isPermissionGranted.mockResolvedValue(false)
    renderHook(() => useNotificationWatcher())
    await waitFor(() => expect(requestPermission).toHaveBeenCalled())
  })

  it('does not request permission when already granted', async () => {
    isPermissionGranted.mockResolvedValue(true)
    renderHook(() => useNotificationWatcher())
    await waitFor(() => expect(isPermissionGranted).toHaveBeenCalled())
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('registers an action listener and unregisters it on unmount', async () => {
    const { unmount } = renderHook(() => useNotificationWatcher())
    await waitFor(() => expect(onAction).toHaveBeenCalled())
    unmount()
    expect(unregister).toHaveBeenCalledOnce()
  })

  it('clicking a notification action focuses the window and routes to the PR tab, marking it read', async () => {
    const windowFocus = vi.spyOn(window, 'focus').mockImplementation(() => {})
    const notif = useNotificationStore.getState().addNotification({
      type: 'new_pr',
      repo: 'org/repo',
      prNumber: 1,
      prTitle: 'Add feature',
      prId: 'pr-1',
      author: 'octocat',
      targetTab: 'waiting',
    })

    renderHook(() => useNotificationWatcher())
    await waitFor(() => expect(onAction).toHaveBeenCalled())
    const actionHandler = onAction.mock.calls[0][0]

    act(() => actionHandler({ id: notif.id }))

    expect(windowFocus).toHaveBeenCalledOnce()
    expect(useRepoUIStore.getState().activeTab).toBe(PULL_REQUESTS_TAB)
    expect(useLaunchpadStore.getState().activeTab).toBe('waiting')
    expect(useNotificationStore.getState().notifications.find((n) => n.id === notif.id)?.read).toBe(true)
  })

  it('ignores an action event for an unknown notification id', async () => {
    renderHook(() => useNotificationWatcher())
    await waitFor(() => expect(onAction).toHaveBeenCalled())
    const actionHandler = onAction.mock.calls[0][0]
    expect(() => act(() => actionHandler({ id: 999999 }))).not.toThrow()
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
    expect(useNotificationStore.getState().notifications[0]).toMatchObject({ type: 'pr_merged', prId: 'pr-1' })
  })

  it('does not notify when notifications are globally disabled', async () => {
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, notifications: { ...DEFAULT_SETTINGS.notifications!, enabled: false } },
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

    await waitFor(() => expect(useNotificationStore.getState().previousPRs['pr-1'].status).toBe('merged'))
  })
})

describe('showNativeNotification', () => {
  const t = ((key: string) => key) as unknown as TFunction

  it('requests permission when not already granted, then sends if granted', async () => {
    isPermissionGranted.mockResolvedValue(false)
    requestPermission.mockResolvedValue('granted')
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

    expect(requestPermission).toHaveBeenCalledOnce()
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ id: notif.id, title: expect.stringContaining('🆕') })
    )
  })

  it('does not send when permission is denied', async () => {
    isPermissionGranted.mockResolvedValue(false)
    requestPermission.mockResolvedValue('denied')
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
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('includes the sound name only when sound is enabled in settings', async () => {
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, notifications: { ...DEFAULT_SETTINGS.notifications!, enableSound: true, soundName: 'ding' } },
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
    expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({ sound: 'ding' }))
  })

  it('does not throw when the notification plugin errors out', async () => {
    isPermissionGranted.mockRejectedValue(new Error('unavailable'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const notif = useNotificationStore.getState().addNotification({
      type: 'new_pr',
      repo: 'org/repo',
      prNumber: 1,
      prTitle: 'Add feature',
      prId: 'pr-1',
      author: 'octocat',
      targetTab: 'prs',
    })
    await expect(showNativeNotification(notif, t)).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalled()
  })
})
