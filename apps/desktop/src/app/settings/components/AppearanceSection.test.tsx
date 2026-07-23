import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { useUserThemes } = vi.hoisted(() => ({ useUserThemes: vi.fn() }))
vi.mock('../../../hooks/useUserThemes', () => ({ useUserThemes }))

import { AppearanceSection } from './AppearanceSection'
import { SettingsSearchProvider } from './settingsSearch'
import { useSettingsStore } from '../../../stores/settings.store'
import { useGameStore } from '../../../stores/game.store'

const INITIAL_SETTINGS = useSettingsStore.getState()
const INITIAL_GAME = useGameStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState(INITIAL_SETTINGS, true)
  useGameStore.setState(INITIAL_GAME, true)
  useUserThemes.mockReturnValue({ data: [] })
})

describe('AppearanceSection — theme picker', () => {
  it('shows the always-unlocked built-in themes', () => {
    render(<AppearanceSection />)
    expect(screen.getByTestId('theme-card-system')).toBeInTheDocument()
    expect(screen.getByTestId('theme-card-dark')).toBeInTheDocument()
    expect(screen.getByTestId('theme-card-light')).toBeInTheDocument()
  })

  it('hides an achievement-gated theme until its achievement unlocks', () => {
    // "forest" is gated by achievement "pr_10" (see achievements.json); all achievements start
    // unlocked: false in the default game store, so it should not show up yet.
    const { rerender } = render(<AppearanceSection />)
    expect(screen.queryByTestId('theme-card-forest')).not.toBeInTheDocument()

    useGameStore.setState({
      achievements: useGameStore
        .getState()
        .achievements.map((a) => (a.id === 'pr_10' ? { ...a, unlocked: true } : a)),
    })
    rerender(<AppearanceSection />)
    expect(screen.getByTestId('theme-card-forest')).toBeInTheDocument()
  })

  it('lists custom user themes with a "custom" badge', () => {
    useUserThemes.mockReturnValue({ data: [{ id: 'my-theme', name: 'My Theme' }] })
    render(<AppearanceSection />)
    expect(screen.getByTestId('theme-card-my-theme')).toBeInTheDocument()
    expect(screen.getByText('custom')).toBeInTheDocument()
  })

  it('selects a theme, marking it active', async () => {
    const user = userEvent.setup()
    render(<AppearanceSection />)
    await user.click(screen.getByTestId('theme-card-dark'))
    expect(useSettingsStore.getState().settings.appearance.theme).toBe('dark')
  })
})

describe('AppearanceSection — font size / density / row height', () => {
  it('binds the font size selector', async () => {
    const user = userEvent.setup()
    render(<AppearanceSection />)
    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0], '16')
    expect(useSettingsStore.getState().settings.appearance.fontSize).toBe(16)
  })

  it('switches density', async () => {
    const user = userEvent.setup()
    render(<AppearanceSection />)
    await user.click(screen.getByRole('radio', { name: "Compact" }))
    expect(useSettingsStore.getState().settings.appearance.density).toBe('compact')
  })

  it('switches row height', async () => {
    const user = userEvent.setup()
    render(<AppearanceSection />)
    await user.click(screen.getByTestId('row-height-radio-small').querySelector('input')!)
    expect(useSettingsStore.getState().settings.appearance.rowHeight).toBe('small')
  })
})

describe('AppearanceSection — notification location and checkboxes', () => {
  it('binds the notification location selector', async () => {
    const user = userEvent.setup()
    render(<AppearanceSection />)
    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[1], 'bottom-left')
    expect(useSettingsStore.getState().settings.appearance.notificationLocation).toBe('bottom-left')
  })

  it('toggles showAvatars, enableAnimations and stickyScroll independently', async () => {
    const user = userEvent.setup()
    render(<AppearanceSection />)
    const checkboxes = screen.getAllByRole('checkbox')
    await user.click(checkboxes[0])
    expect(useSettingsStore.getState().settings.appearance.showAvatars).toBe(false)
    await user.click(checkboxes[1])
    expect(useSettingsStore.getState().settings.appearance.enableAnimations).toBe(false)
    await user.click(checkboxes[2])
    expect(useSettingsStore.getState().settings.appearance.stickyScroll).toBe(true)
  })

  it('defaults stickyScroll off', () => {
    render(<AppearanceSection />)
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes[2]).not.toBeChecked()
  })
})

describe('AppearanceSection — integrated terminal colours', () => {
  it('seeds the pickers from the current settings (black background by default)', () => {
    render(<AppearanceSection />)
    expect(screen.getByTestId('appearance-terminal-bg')).toHaveValue('#000000')
    expect(screen.getByTestId('appearance-terminal-fg')).toHaveValue('#e4e4e7')
  })

  it('updates the background and text colours', () => {
    render(<AppearanceSection />)
    // `<input type="color">` can't be typed into with userEvent — fire the change directly.
    fireEvent.change(screen.getByTestId('appearance-terminal-bg'), {
      target: { value: '#123456' },
    })
    fireEvent.change(screen.getByTestId('appearance-terminal-fg'), {
      target: { value: '#ffffff' },
    })
    expect(useSettingsStore.getState().settings.appearance.terminalBackground).toBe('#123456')
    expect(useSettingsStore.getState().settings.appearance.terminalForeground).toBe('#ffffff')
  })

  it('resets the colours to their defaults', async () => {
    const user = userEvent.setup()
    useSettingsStore.setState((s) => ({
      settings: {
        ...s.settings,
        appearance: {
          ...s.settings.appearance,
          terminalBackground: '#abcdef',
          terminalForeground: '#fedcba',
        },
      },
    }))
    render(<AppearanceSection />)
    await user.click(screen.getByTestId('appearance-terminal-reset'))
    expect(useSettingsStore.getState().settings.appearance.terminalBackground).toBe('#000000')
    expect(useSettingsStore.getState().settings.appearance.terminalForeground).toBe('#e4e4e7')
  })
})

describe('AppearanceSection — in-page search filtering', () => {
  it('shows only the settings matching the query, and highlights the match', () => {
    render(
      <SettingsSearchProvider query="terminal">
        <AppearanceSection />
      </SettingsSearchProvider>
    )
    const terminal = screen.getByTestId('setting-terminal-colors')
    expect(terminal).toBeInTheDocument()
    // The unrelated settings are hidden.
    expect(screen.queryByTestId('setting-theme')).not.toBeInTheDocument()
    expect(screen.queryByTestId('setting-font-size')).not.toBeInTheDocument()
    expect(screen.queryByTestId('setting-density')).not.toBeInTheDocument()
    // The matched word is highlighted in the visible label.
    expect(terminal.querySelector('mark')).toHaveTextContent(/terminal/i)
  })

  it('matches a setting via its synonym keywords, not just the visible label', () => {
    // "console" isn't in the label but is a keyword of the terminal-colours setting.
    render(
      <SettingsSearchProvider query="console">
        <AppearanceSection />
      </SettingsSearchProvider>
    )
    expect(screen.getByTestId('setting-terminal-colors')).toBeInTheDocument()
    expect(screen.queryByTestId('setting-theme')).not.toBeInTheDocument()
  })

  it('shows everything again once the query is cleared', () => {
    render(
      <SettingsSearchProvider query="">
        <AppearanceSection />
      </SettingsSearchProvider>
    )
    expect(screen.getByTestId('setting-theme')).toBeInTheDocument()
    expect(screen.getByTestId('setting-terminal-colors')).toBeInTheDocument()
    expect(screen.getByTestId('setting-font-size')).toBeInTheDocument()
  })
})
