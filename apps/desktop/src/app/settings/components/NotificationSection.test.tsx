import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// `notifyUser`, not `showNativeNotification`: the test button goes through the orchestrator that
// picks a surface from the display-style setting, so that it tests what the user actually gets.
const { notifyUser } = vi.hoisted(() => ({ notifyUser: vi.fn() }))
vi.mock('../../../hooks/useNotificationWatcher', () => ({ notifyUser }))

import { NotificationSection } from './NotificationSection'
import { useSettingsStore } from '../../../stores/settings.store'
import { useNotificationStore } from '../../../stores/notification.store'

const INITIAL_SETTINGS = useSettingsStore.getState()
const INITIAL_NOTIF = useNotificationStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState(INITIAL_SETTINGS, true)
  useNotificationStore.setState({ ...INITIAL_NOTIF, notifications: [] })
})

describe('NotificationSection — global toggle', () => {
  it('shows the Bell icon and event sections when enabled', () => {
    render(<NotificationSection />)
    expect(document.querySelector('.lucide-bell')).toBeTruthy()
    expect(screen.getByText("Notification events")).toBeInTheDocument()
  })

  it('shows the BellOff icon and hides everything else when disabled', () => {
    useSettingsStore.setState({
      settings: {
        ...INITIAL_SETTINGS.settings,
        notifications: { ...INITIAL_SETTINGS.settings.notifications!, enabled: false },
      },
    })
    render(<NotificationSection />)
    expect(document.querySelector('.lucide-bell-off')).toBeTruthy()
    expect(screen.queryByText('Notification events')).not.toBeInTheDocument()
  })

  it('toggles the global switch', async () => {
    const user = userEvent.setup()
    render(<NotificationSection />)
    // The global enable control is a Switch (role="switch"), rendered first.
    const toggles = screen.getAllByRole('switch')
    await user.click(toggles[0])
    expect(useSettingsStore.getState().settings.notifications!.enabled).toBe(false)
  })
})

describe('NotificationSection — event toggles', () => {
  it('toggles each event notification independently', async () => {
    const user = userEvent.setup()
    render(<NotificationSection />)

    await user.click(screen.getByRole('checkbox', { name: 'Automatic fetch' }))
    expect(useSettingsStore.getState().settings.notifications!.notifyOnFetch).toBe(false)

    await user.click(screen.getByRole('checkbox', { name: 'New pull requests' }))
    expect(useSettingsStore.getState().settings.notifications!.notifyOnNewPr).toBe(false)
  })

  it('offers one toggle per step of a PR lifecycle, CI and the merge queue included', async () => {
    const user = userEvent.setup()
    render(<NotificationSection />)

    await user.click(screen.getByRole('checkbox', { name: 'CI results' }))
    expect(useSettingsStore.getState().settings.notifications!.notifyOnCi).toBe(false)

    await user.click(screen.getByRole('checkbox', { name: 'PRs queued to merge' }))
    expect(useSettingsStore.getState().settings.notifications!.notifyOnPrQueued).toBe(false)

    await user.click(screen.getByRole('checkbox', { name: 'Merged or closed PRs' }))
    expect(useSettingsStore.getState().settings.notifications!.notifyOnPrMerged).toBe(false)
  })
})

describe('NotificationSection — sounds', () => {
  it('shows the sound-name picker only once sound is enabled', async () => {
    const user = userEvent.setup()
    render(<NotificationSection />)
    expect(screen.queryByText('macOS sound type')).not.toBeInTheDocument()

    // The sound control is a Switch (role="switch"), rendered after the global one.
    const soundToggle = screen.getAllByRole('switch').at(-1)!
    await user.click(soundToggle)
    expect(useSettingsStore.getState().settings.notifications!.enableSound).toBe(true)
  })

  it('binds the selected sound name', async () => {
    useSettingsStore.setState({
      settings: {
        ...INITIAL_SETTINGS.settings,
        notifications: { ...INITIAL_SETTINGS.settings.notifications!, enableSound: true },
      },
    })
    const user = userEvent.setup()
    render(<NotificationSection />)
    // Named, not `getByRole('combobox')`: the display block above renders two more selects.
    await user.selectOptions(screen.getByRole('combobox', { name: 'macOS sound type' }), 'Glass')
    expect(useSettingsStore.getState().settings.notifications!.soundName).toBe('Glass')
  })
})

describe('NotificationSection — display', () => {
  it('defaults to the app popover, visible for 5 seconds', () => {
    render(<NotificationSection />)
    expect(screen.getByRole('combobox', { name: 'Style' })).toHaveValue('popover')
    expect(screen.getByRole('combobox', { name: 'Visible for' })).toHaveValue('5000')
  })

  it('binds the selected duration, including "until I close it"', async () => {
    const user = userEvent.setup()
    render(<NotificationSection />)
    const duration = screen.getByRole('combobox', { name: 'Visible for' })

    await user.selectOptions(duration, '12000')
    expect(useSettingsStore.getState().settings.notifications!.displayDurationMs).toBe(12000)

    await user.selectOptions(duration, '0')
    expect(useSettingsStore.getState().settings.notifications!.displayDurationMs).toBe(0)
  })

  // The OS owns a banner's lifetime, so offering a duration next to it would be a dead control.
  it('binds the selected style and drops the duration picker for the native banner', async () => {
    const user = userEvent.setup()
    render(<NotificationSection />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Style' }), 'native')

    expect(useSettingsStore.getState().settings.notifications!.displayStyle).toBe('native')
    expect(screen.queryByRole('combobox', { name: 'Visible for' })).not.toBeInTheDocument()
  })
})

describe('NotificationSection — test notification', () => {
  it('adds a test notification and shows it on the selected surface', async () => {
    const user = userEvent.setup()
    render(<NotificationSection />)
    await user.click(screen.getByText('Send a test notification'))

    expect(useNotificationStore.getState().notifications).toHaveLength(1)
    expect(useNotificationStore.getState().notifications[0]).toMatchObject({
      type: 'review_requested',
      prId: 'test-pr-settings',
    })
    expect(notifyUser).toHaveBeenCalledOnce()
  })
})
