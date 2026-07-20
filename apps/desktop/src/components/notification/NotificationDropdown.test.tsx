import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { showNativeNotification } = vi.hoisted(() => ({ showNativeNotification: vi.fn() }))
vi.mock('../../hooks/useNotificationWatcher', () => ({ showNativeNotification }))

import { NotificationDropdown } from './NotificationDropdown'
import { useNotificationStore, type AppNotification } from '../../stores/notification.store'
import { useRepoUIStore, PULL_REQUESTS_TAB } from '../../stores/repoUI.store'
import { useLaunchpadStore } from '../../stores/launchpad.store'
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
  useLaunchpadStore.setState({ activeTab: 'prs' })
  useSettingsStore.setState(INITIAL_SETTINGS)
  vi.stubEnv('DEV', false)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
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
    await user.click(screen.getByTitle("Notifications"))
    expect(screen.getByText("No notifications yet")).toBeInTheDocument()
  })

  it('lists up to the 5 most recent notifications', async () => {
    const notifs = Array.from({ length: 7 }, (_, i) => notification({ id: i, prNumber: 100 + i }))
    useNotificationStore.setState({ notifications: notifs })
    const user = userEvent.setup()
    render(<NotificationDropdown />)
    await user.click(screen.getByTitle("Notifications"))
    expect(screen.getAllByText(/PR #\d+ Merged/)).toHaveLength(5)
  })

  it('marks a notification read, routes to the launchpad tab, and closes the popover on click', async () => {
    useNotificationStore.setState({ notifications: [notification({ targetTab: 'waiting' })] })
    const user = userEvent.setup()
    render(<NotificationDropdown />)
    await user.click(screen.getByTitle("Notifications"))
    await user.click(screen.getByText(/PR #\d+ Merged/))

    expect(useNotificationStore.getState().notifications[0].read).toBe(true)
    expect(useRepoUIStore.getState().activeTab).toBe(PULL_REQUESTS_TAB)
    expect(useLaunchpadStore.getState().activeTab).toBe('waiting')
    expect(screen.queryByText("No notifications yet")).not.toBeInTheDocument()
    expect(screen.queryByText(/PR #\d+ Merged/)).not.toBeInTheDocument()
  })

  it('marks all as read', async () => {
    useNotificationStore.setState({
      notifications: [notification({ read: false }), notification({ id: 2, read: false })],
    })
    const user = userEvent.setup()
    render(<NotificationDropdown />)
    await user.click(screen.getByTitle("Notifications"))
    await user.click(screen.getByTitle("Mark all as read"))
    expect(useNotificationStore.getState().notifications.every((n) => n.read)).toBe(true)
  })

  it('clears all notifications', async () => {
    useNotificationStore.setState({ notifications: [notification()] })
    const user = userEvent.setup()
    render(<NotificationDropdown />)
    await user.click(screen.getByTitle("Notifications"))
    await user.click(screen.getByTitle("Clear all"))
    expect(useNotificationStore.getState().notifications).toEqual([])
  })
})

describe('NotificationDropdown — simulator panel visibility', () => {
  it('shows the simulator when there is no active GitHub token', async () => {
    const user = userEvent.setup()
    render(<NotificationDropdown />)
    await user.click(screen.getByTitle("Notifications"))
    expect(screen.getByText("Simulate Change")).toBeInTheDocument()
  })

  it('hides the PR mutator (but keeps the simulator panel) once a GitHub token is active in production', async () => {
    useSettingsStore.setState({
      settings: {
        ...INITIAL_SETTINGS.settings,
        github: {
          accounts: [{ id: 'acc1', token: 'tok', login: 'me' } as never],
          activeAccountId: 'acc1',
        },
      },
    })
    const user = userEvent.setup()
    render(<NotificationDropdown />)
    await user.click(screen.getByTitle("Notifications"))
    expect(screen.queryByText("Simulate Change")).not.toBeInTheDocument()
  })

  it('shows dev-mode test-trigger buttons only when DEV is true', async () => {
    vi.stubEnv('DEV', true)
    const user = userEvent.setup()
    render(<NotificationDropdown />)
    await user.click(screen.getByTitle("Notifications"))
    expect(screen.getByText('Test Review')).toBeInTheDocument()
    expect(screen.getByText('DEV MODE')).toBeInTheDocument()
  })

  it('does not show dev-mode test-trigger buttons when DEV is false', async () => {
    const user = userEvent.setup()
    render(<NotificationDropdown />)
    await user.click(screen.getByTitle("Notifications"))
    expect(screen.queryByText('Test Review')).not.toBeInTheDocument()
  })
})

describe('NotificationDropdown — dev test triggers', () => {
  it('adds a notification and fires a native notification when a test trigger is clicked', async () => {
    vi.stubEnv('DEV', true)
    const user = userEvent.setup()
    render(<NotificationDropdown />)
    await user.click(screen.getByTitle("Notifications"))
    await user.click(screen.getByText('Test Review'))

    expect(useNotificationStore.getState().notifications).toHaveLength(1)
    expect(useNotificationStore.getState().notifications[0]).toMatchObject({
      type: 'review_requested',
      prId: 'test-pr-review',
    })
    expect(showNativeNotification).toHaveBeenCalledOnce()
  })
})

describe('NotificationDropdown — PR simulator', () => {
  beforeEach(() => {
    useNotificationStore.setState({
      mockPRs: [{ id: 'pr-1', number: 10, repo: 'git-manager', status: 'open' } as never],
    })
  })

  it('runs the simulation with the selected PR and (default "merge") action', async () => {
    const user = userEvent.setup()
    render(<NotificationDropdown />)
    await user.click(screen.getByTitle("Notifications"))
    await user.click(screen.getByText("Run Sim"))
    expect(useNotificationStore.getState().mockPRs[0]).toMatchObject({
      id: 'pr-1',
      status: 'merged',
    })
  })
})
