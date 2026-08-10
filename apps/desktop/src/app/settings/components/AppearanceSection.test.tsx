import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { useUserThemes } = vi.hoisted(() => ({ useUserThemes: vi.fn() }))
vi.mock('../../../hooks/useUserThemes', () => ({ useUserThemes }))

import { AppearanceSection } from './AppearanceSection'
import { SettingsSearchProvider } from './settingsSearch'
import { useSettingsStore } from '../../../stores/settings.store'
import { useGameStore } from '../../../stores/game.store'
import { DEV_FLAG_DEFAULTS, useDevFlagsStore } from '../../../stores/devFlags.store'

const INITIAL_SETTINGS = useSettingsStore.getState()
const INITIAL_GAME = useGameStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState(INITIAL_SETTINGS, true)
  useGameStore.setState(INITIAL_GAME, true)
  useDevFlagsStore.setState(DEV_FLAG_DEFAULTS)
  useUserThemes.mockReturnValue({ data: [] })
})

describe('AppearanceSection — theme picker', () => {
  it('shows the always-unlocked built-in themes', () => {
    render(<AppearanceSection />)
    expect(screen.getByTestId('theme-card-system')).toBeInTheDocument()
    expect(screen.getByTestId('theme-card-dark')).toBeInTheDocument()
    expect(screen.getByTestId('theme-card-light')).toBeInTheDocument()
  })

  it('shows an achievement-gated theme with a locked badge until its achievement unlocks', () => {
    // "forest" is gated by achievement "pr_10" (see achievements.json); all achievements start
    // unlocked: false in the default game store, so it renders locked rather than hidden.
    const { rerender } = render(<AppearanceSection />)
    expect(screen.getByTestId('theme-card-forest')).toBeInTheDocument()
    expect(screen.getByTestId('theme-locked-badge-forest')).toBeInTheDocument()

    useGameStore.setState({
      achievements: useGameStore
        .getState()
        .achievements.map((a) => (a.id === 'pr_10' ? { ...a, unlocked: true } : a)),
    })
    rerender(<AppearanceSection />)
    expect(screen.getByTestId('theme-card-forest')).toBeInTheDocument()
    expect(screen.queryByTestId('theme-locked-badge-forest')).not.toBeInTheDocument()
  })

  it('does not change the active theme when clicking a locked theme card', async () => {
    const user = userEvent.setup()
    render(<AppearanceSection />)
    const before = useSettingsStore.getState().settings.appearance.theme
    await user.click(screen.getByTestId('theme-card-forest'))
    expect(useSettingsStore.getState().settings.appearance.theme).toBe(before)
  })

  // The dev escape hatch behind `pnpm dev:themes` / VITE_UNLOCK_THEMES: twelve of the fourteen
  // built-ins are gated, and a theme nobody can select is a theme nobody restyles or grades.
  it('opens every gated theme while the dev unlock flag is on', async () => {
    const user = userEvent.setup()
    useDevFlagsStore.setState({ unlockThemes: true })
    render(<AppearanceSection />)

    expect(screen.queryByTestId('theme-locked-badge-forest')).not.toBeInTheDocument()
    expect(screen.queryByTestId('theme-locked-badge-glass')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('theme-card-forest'))
    expect(useSettingsStore.getState().settings.appearance.theme).toBe('forest')
  })

  it('leaves the gate alone when the flag is off, which is every build that did not ask for it', () => {
    render(<AppearanceSection />)
    expect(screen.getByTestId('theme-locked-badge-forest')).toBeInTheDocument()
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

describe('AppearanceSection — font size / row height', () => {
  it('binds the font size selector', async () => {
    const user = userEvent.setup()
    render(<AppearanceSection />)
    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0], '16')
    expect(useSettingsStore.getState().settings.appearance.fontSize).toBe(16)
  })

  it('offers no density picker, since nothing in the app reads that setting', () => {
    render(<AppearanceSection />)
    expect(screen.queryByRole('radio', { name: 'Compact' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Comfortable' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('setting-density')).not.toBeInTheDocument()
  })

  it('switches row height, starting from the small default', async () => {
    const user = userEvent.setup()
    render(<AppearanceSection />)
    expect(useSettingsStore.getState().settings.appearance.rowHeight).toBe('small')
    await user.click(screen.getByTestId('row-height-radio-standard').querySelector('input')!)
    expect(useSettingsStore.getState().settings.appearance.rowHeight).toBe('standard')
    await user.click(screen.getByTestId('row-height-radio-small').querySelector('input')!)
    expect(useSettingsStore.getState().settings.appearance.rowHeight).toBe('small')
  })

  it('explains what the row height changes, and what it leaves alone', async () => {
    const user = userEvent.setup()
    render(<AppearanceSection />)
    await user.hover(screen.getByTestId('setting-info-row-height'))
    expect(await screen.findByText(/Height of every commit row in the graph/)).toBeVisible()
    expect(screen.getByText(/Affects the commit graph only/)).toBeVisible()
  })

  it('lists the row heights smallest-first, without pixel values in their labels', () => {
    render(<AppearanceSection />)
    const labels = [
      screen.getByTestId('row-height-radio-small'),
      screen.getByTestId('row-height-radio-standard'),
    ]
    expect(labels[0].compareDocumentPosition(labels[1])).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(labels[0]).toHaveTextContent('Small')
    expect(labels[1]).toHaveTextContent('Standard')
    labels.forEach((label) => expect(label.textContent).not.toMatch(/px/))
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
    expect(screen.queryByTestId('setting-row-height')).not.toBeInTheDocument()
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

// The setting only acts on a theme that carries a native window material; showing it
// on an opaque theme would offer a control that visibly does nothing.
describe('AppearanceSection — window transparency', () => {
  function setTheme(theme: string) {
    const settings = useSettingsStore.getState().settings
    useSettingsStore.setState({
      settings: { ...settings, appearance: { ...settings.appearance, theme } },
    })
  }

  it('is hidden for an opaque theme', () => {
    setTheme('dark')
    render(<AppearanceSection />)
    expect(screen.queryByTestId('setting-glass-transparency')).not.toBeInTheDocument()
  })

  it('is shown for a translucent theme, as a slider spanning the full range', () => {
    setTheme('glass')
    render(<AppearanceSection />)
    expect(screen.getByTestId('setting-glass-transparency')).toBeInTheDocument()
    expect(screen.getByText('Window transparency')).toBeInTheDocument()
    const slider = screen.getByTestId('glass-transparency-slider')
    // The ends have to be the real extremes: a slider that stops short of transparent
    // is what made this setting look like it did nothing.
    expect(slider).toHaveAttribute('min', '0')
    expect(slider).toHaveAttribute('max', '100')
    expect(screen.getByText('Opaque')).toBeInTheDocument()
    expect(screen.getByText('Clear')).toBeInTheDocument()
  })

  it('persists the chosen level to the settings store', () => {
    setTheme('glass')
    render(<AppearanceSection />)
    fireEvent.change(screen.getByTestId('glass-transparency-slider'), { target: { value: '37' } })
    expect(useSettingsStore.getState().settings.appearance.glassTransparency).toBe(37)
  })

  it('shows the current level as a readable percentage', () => {
    setTheme('glass')
    render(<AppearanceSection />)
    fireEvent.change(screen.getByTestId('glass-transparency-slider'), { target: { value: '42' } })
    expect(screen.getByText('42%')).toBeInTheDocument()
  })
})
