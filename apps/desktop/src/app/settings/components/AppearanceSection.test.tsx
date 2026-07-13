import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const { useUserThemes } = vi.hoisted(() => ({ useUserThemes: vi.fn() }))
vi.mock('../../../hooks/useUserThemes', () => ({ useUserThemes }))

import { AppearanceSection } from './AppearanceSection'
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
    await user.click(screen.getByRole('radio', { name: 'settings.appearance.density.compact' }))
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

  it('toggles showAvatars and enableAnimations independently', async () => {
    const user = userEvent.setup()
    render(<AppearanceSection />)
    const checkboxes = screen.getAllByRole('checkbox')
    await user.click(checkboxes[0])
    expect(useSettingsStore.getState().settings.appearance.showAvatars).toBe(false)
    await user.click(checkboxes[1])
    expect(useSettingsStore.getState().settings.appearance.enableAnimations).toBe(false)
  })
})
