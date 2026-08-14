import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const apiSetAppIcon = vi.fn()
vi.mock('../../../api/appIcon.api', () => ({
  apiSetAppIcon: (icon: string) => apiSetAppIcon(icon),
}))

import { AppIconSection } from './AppIconSection'
import { useSettingsStore } from '../../../stores/settings.store'

const INITIAL_SETTINGS = useSettingsStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  apiSetAppIcon.mockResolvedValue(undefined)
  useSettingsStore.setState(INITIAL_SETTINGS, true)
})

describe('AppIconSection', () => {
  it('renders the icon picker and all icon options', () => {
    render(<AppIconSection />)

    expect(screen.getByTestId('setting-app-icon')).toBeInTheDocument()
    expect(screen.getByTestId('app-icon-list')).toBeInTheDocument()
    expect(screen.getByTestId('app-icon-card-default')).toBeInTheDocument()
    expect(screen.getByTestId('app-icon-card-line')).toBeInTheDocument()
    expect(screen.getByTestId('app-icon-card-flat')).toBeInTheDocument()
    expect(screen.getByTestId('app-icon-card-minimal-light')).toBeInTheDocument()
    expect(screen.getByTestId('app-icon-card-neon')).toBeInTheDocument()
    expect(screen.getByTestId('app-icon-card-3d')).toBeInTheDocument()
    expect(screen.getByTestId('app-icon-card-light')).toBeInTheDocument()
    expect(screen.getByTestId('app-icon-card-duotone')).toBeInTheDocument()
  })

  it('selects the default icon initially when no custom icon is stored', () => {
    render(<AppIconSection />)

    const defaultRadio = screen.getByTestId('app-icon-radio-default') as HTMLInputElement
    expect(defaultRadio.checked).toBe(true)

    const neonRadio = screen.getByTestId('app-icon-radio-neon') as HTMLInputElement
    expect(neonRadio.checked).toBe(false)
  })

  it('selects the persisted icon from settings store on render', () => {
    useSettingsStore.setState({
      settings: {
        ...INITIAL_SETTINGS.settings,
        appearance: { ...INITIAL_SETTINGS.settings.appearance, appIcon: 'duotone' },
      },
    })

    render(<AppIconSection />)

    const duotoneRadio = screen.getByTestId('app-icon-radio-duotone') as HTMLInputElement
    expect(duotoneRadio.checked).toBe(true)
  })

  it('writes the picked icon to settings and leaves the host call to useAppIcon', async () => {
    const user = userEvent.setup()
    render(<AppIconSection />)

    await user.click(screen.getByTestId('app-icon-card-neon'))

    expect(useSettingsStore.getState().settings.appearance.appIcon).toBe('neon')
    // The section is not a second route to the host: `useAppIcon` owns that, so a picked icon
    // reaches the Dock once whether it was picked here or synced from another window.
    expect(apiSetAppIcon).not.toHaveBeenCalled()

    const neonRadio = screen.getByTestId('app-icon-radio-neon') as HTMLInputElement
    expect(neonRadio.checked).toBe(true)
  })

  it('does not rewrite the setting when clicking the already selected icon', async () => {
    const user = userEvent.setup()
    const updateSpy = vi.spyOn(useSettingsStore.getState(), 'updateSettings')
    render(<AppIconSection />)

    await user.click(screen.getByTestId('app-icon-card-default'))

    expect(updateSpy).not.toHaveBeenCalled()
    updateSpy.mockRestore()
  })
})
