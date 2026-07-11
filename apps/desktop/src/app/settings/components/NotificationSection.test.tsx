import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
const { showNativeNotification } = vi.hoisted(() => ({ showNativeNotification: vi.fn() }))
vi.mock('../../../hooks/useNotificationWatcher', () => ({ showNativeNotification }))

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
    expect(screen.getByText('Événements de notification')).toBeInTheDocument()
  })

  it('shows the BellOff icon and hides everything else when disabled', () => {
    useSettingsStore.setState({
      settings: { ...INITIAL_SETTINGS.settings, notifications: { ...INITIAL_SETTINGS.settings.notifications!, enabled: false } },
    })
    render(<NotificationSection />)
    expect(document.querySelector('.lucide-bell-off')).toBeTruthy()
    expect(screen.queryByText('Événements de notification')).not.toBeInTheDocument()
  })

  it('toggles the global switch', async () => {
    const user = userEvent.setup()
    render(<NotificationSection />)
    const toggles = screen.getAllByRole('checkbox')
    await user.click(toggles[0])
    expect(useSettingsStore.getState().settings.notifications!.enabled).toBe(false)
  })
})

describe('NotificationSection — event toggles', () => {
  it('toggles each event notification independently', async () => {
    const user = userEvent.setup()
    render(<NotificationSection />)
    // checkbox order: [0] global enable, [1..7] the 7 events, [8] sound toggle
    const checkboxes = screen.getAllByRole('checkbox')
    await user.click(checkboxes[1]) // notifyOnFetch
    expect(useSettingsStore.getState().settings.notifications!.notifyOnFetch).toBe(false)

    await user.click(checkboxes[4]) // notifyOnNewPr
    expect(useSettingsStore.getState().settings.notifications!.notifyOnNewPr).toBe(false)
  })
})

describe('NotificationSection — sounds', () => {
  it('shows the sound-name picker only once sound is enabled', async () => {
    const user = userEvent.setup()
    render(<NotificationSection />)
    expect(screen.queryByText('Type de son macOS')).not.toBeInTheDocument()

    const soundToggle = screen.getAllByRole('checkbox').at(-1)!
    await user.click(soundToggle)
    expect(useSettingsStore.getState().settings.notifications!.enableSound).toBe(true)
  })

  it('binds the selected sound name', async () => {
    useSettingsStore.setState({
      settings: { ...INITIAL_SETTINGS.settings, notifications: { ...INITIAL_SETTINGS.settings.notifications!, enableSound: true } },
    })
    const user = userEvent.setup()
    render(<NotificationSection />)
    await user.selectOptions(screen.getByRole('combobox'), 'Glass')
    expect(useSettingsStore.getState().settings.notifications!.soundName).toBe('Glass')
  })
})

describe('NotificationSection — test notification', () => {
  it('adds a test notification and fires a native notification', async () => {
    const user = userEvent.setup()
    render(<NotificationSection />)
    await user.click(screen.getByText('Tester la notification macOS'))

    expect(useNotificationStore.getState().notifications).toHaveLength(1)
    expect(useNotificationStore.getState().notifications[0]).toMatchObject({ type: 'review_requested', prId: 'test-pr-settings' })
    expect(showNativeNotification).toHaveBeenCalledOnce()
  })
})
