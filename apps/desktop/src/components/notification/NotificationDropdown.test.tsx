import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// `notifyUser`, not `showNativeNotification`: the dev triggers go through the orchestrator that
// tries the custom tray popover first and only falls back to the OS banner (there is no tray, and
// no Tauri host at all, under jsdom).
const { notifyUser } = vi.hoisted(() => ({ notifyUser: vi.fn() }))
vi.mock('../../hooks/useNotificationWatcher', () => ({ notifyUser }))

import { NotificationDropdown } from './NotificationDropdown'
import { useNotificationStore, type AppNotification } from '../../stores/notification.store'
import { useRepoUIStore, PULL_REQUESTS_TAB } from '../../stores/repoUI.store'
import { useLaunchpadStore } from '../../features/launchpad/stores/launchpad.store'
import { useSettingsStore } from '../../stores/settings.store'

const INITIAL_NOTIF = useNotificationStore.getState()
const INITIAL_SETTINGS = useSettingsStore.getState()

function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 1,
    type: 'pr_merged',
    repo: 'git-manager',
    prNumber: 42,
    prTitle: 'feat: add thing',
    prId: 'pr-42',
    author: 'antoine',
    createdAt: Date.now(),
    read: false,
    targetTab: 'prs',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useNotificationStore.setState({ ...INITIAL_NOTIF, notifications: [], mockPRs: [] })
  useRepoUIStore.setState({ activeTab: 'dashboard' })
  useLaunchpadStore.setState({ activeTab: 'prs', pendingOpenPrId: null })
  useSettingsStore.setState(INITIAL_SETTINGS)
  vi.stubEnv('DEV', false)
})

describe('NotificationDropdown — bell badge', () => {
  it('shows no unread badge when there are no notifications', () => {
    render(<NotificationDropdown />)
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument()
  })

  it('shows the unread count on the bell when there are unread notifications', () => {
    useNotificationStore.setState({
      notifications: [notification({ read: false }), notification({ id: 2, read: true })],
    })
    render(<NotificationDropdown />)
    expect(screen.getByText('1')).toBeInTheDocument()
  })
})

describe('NotificationDropdown — list', () => {
  it('shows an empty state when there are no notifications', async () => {
    const user = userEvent.setup()
    render(<NotificationDropdown />)
    await user.click(screen.getByTitle('Notifications'))
    expect(screen.getByText('No notifications yet')).toBeInTheDocument()
  })

  it('lists up to the 5 most recent notifications', async () => {
    const notifs = Array.from({ length: 7 }, (_, i) => notification({ id: i, prNumber: 100 + i }))
    useNotificationStore.setState({ notifications: notifs })
    const user = userEvent.setup()
    render(<NotificationDropdown />)
    await user.click(screen.getByTitle('Notifications'))
    expect(screen.getAllByText(/PR #\d+ Merged/)).toHaveLength(5)
  })

  // No local clone of the repo here (no added repos), so the click takes the Launchpad fallback —
  // the same route an OS banner for this notification would follow.
  it('marks a notification read, routes to the launchpad tab, and closes the popover on click', async () => {
    useNotificationStore.setState({ notifications: [notification({ targetTab: 'waiting' })] })
    const user = userEvent.setup()
    render(<NotificationDropdown />)
    await user.click(screen.getByTitle('Notifications'))
    await user.click(screen.getByText(/PR #\d+ Merged/))

    expect(useNotificationStore.getState().notifications[0].read).toBe(true)
    expect(useRepoUIStore.getState().activeTab).toBe(PULL_REQUESTS_TAB)
    expect(useLaunchpadStore.getState().activeTab).toBe('waiting')
    expect(useLaunchpadStore.getState().pendingOpenPrId).toBe('pr-42')
    expect(screen.queryByText('No notifications yet')).not.toBeInTheDocument()
    expect(screen.queryByText(/PR #\d+ Merged/)).not.toBeInTheDocument()
  })

  it('marks all as read', async () => {
    useNotificationStore.setState({
      notifications: [notification({ read: false }), notification({ id: 2, read: false })],
    })
    const user = userEvent.setup()
    render(<NotificationDropdown />)
    await user.click(screen.getByTitle('Notifications'))
    await user.click(screen.getByTitle('Mark all as read'))
    expect(useNotificationStore.getState().notifications.every((n) => n.read)).toBe(true)
  })

  it('clears all notifications', async () => {
    useNotificationStore.setState({ notifications: [notification()] })
    const user = userEvent.setup()
    render(<NotificationDropdown />)
    await user.click(screen.getByTitle('Notifications'))
    await user.click(screen.getByTitle('Clear all'))
    expect(useNotificationStore.getState().notifications).toEqual([])
  })
})

describe('NotificationDropdown — no test affordances', () => {
  // The simulator panel and the four dev-only "Test …" buttons moved to the footer's debug menu.
  // A trigger hidden inside the very surface it tests is only discoverable by whoever wrote it,
  // and this component had grown to twice the size of the list it renders.
  it('carries no simulator, even in a dev build', async () => {
    vi.stubEnv('DEV', true)
    const user = userEvent.setup()
    render(<NotificationDropdown />)
    await user.click(screen.getByTitle('Notifications'))

    expect(screen.queryByText('Simulate Change')).not.toBeInTheDocument()
    expect(screen.queryByText('Test Review')).not.toBeInTheDocument()
    expect(screen.queryByText('DEV MODE')).not.toBeInTheDocument()
  })

  it('shows nothing extra to a user with no GitHub token either', async () => {
    // The mock-PR mutator used to appear for anyone token-less, not just in development.
    useSettingsStore.setState({
      ...INITIAL_SETTINGS,
      settings: { ...INITIAL_SETTINGS.settings, github: { accounts: [], activeAccountId: null } },
    })
    const user = userEvent.setup()
    render(<NotificationDropdown />)
    await user.click(screen.getByTitle('Notifications'))

    expect(screen.queryByText('Simulate Change')).not.toBeInTheDocument()
  })
})
