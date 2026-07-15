import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  i18next: { changeLanguage: vi.fn() },
}))
const { pluginOpen } = vi.hoisted(() => ({ pluginOpen: vi.fn() }))
vi.mock('@tauri-apps/plugin-shell', () => ({ open: pluginOpen }))

import { i18next } from '@git-manager/i18n'
import { GeneralSection } from './GeneralSection'
import { useSettingsStore } from '../../../stores/settings.store'

const INITIAL_SETTINGS = useSettingsStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState(INITIAL_SETTINGS, true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GeneralSection — language', () => {
  it('switches language: updates the store and i18next', async () => {
    useSettingsStore.setState({ settings: { ...INITIAL_SETTINGS.settings, language: 'fr' } })
    const user = userEvent.setup()
    render(<GeneralSection />)
    await user.click(screen.getByRole('radio', { name: 'settings.language.en' }))
    expect(useSettingsStore.getState().settings.language).toBe('en')
    expect(i18next.changeLanguage).toHaveBeenCalledWith('en')
  })
})

describe('GeneralSection — git identity', () => {
  it('binds the default author name/email', async () => {
    const user = userEvent.setup()
    render(<GeneralSection />)
    const [nameInput, emailInput] = screen
      .getAllByRole('textbox')
      .filter((el) => !el.closest('[class*="flex-wrap"]'))
    await user.type(nameInput, 'Ada')
    expect(useSettingsStore.getState().settings.git.defaultAuthorName).toBe('Ada')
    await user.type(emailInput, 'ada@example.com')
    expect(useSettingsStore.getState().settings.git.defaultAuthorEmail).toBe('ada@example.com')
  })
})

describe('GeneralSection — scan settings', () => {
  it('adds a scan exclusion via the tag input', async () => {
    const user = userEvent.setup()
    render(<GeneralSection />)
    // Default scanExclusions is already non-empty, so TagInput blanks its placeholder — find the
    // input via its tag container instead.
    const tagInput = screen.getByText('node_modules').closest('div')!.querySelector('input')!
    await user.type(tagInput, '.turbo{Enter}')
    expect(useSettingsStore.getState().settings.advanced.scanExclusions).toContain('.turbo')
  })

  it('updates the max scan depth', async () => {
    useSettingsStore.setState({
      settings: {
        ...INITIAL_SETTINGS.settings,
        advanced: { ...INITIAL_SETTINGS.settings.advanced, maxScanDepth: 3 },
      },
    })
    const user = userEvent.setup()
    render(<GeneralSection />)
    const input = screen.getByDisplayValue('3')
    await user.clear(input)
    await user.type(input, '7')
    expect(useSettingsStore.getState().settings.advanced.maxScanDepth).toBe(7)
  })

  it('opens the data folder via the shell plugin', async () => {
    pluginOpen.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<GeneralSection />)
    await user.click(screen.getByText('settings.advanced.openDataFolder'))
    expect(pluginOpen).toHaveBeenCalledWith('~/.config/git-manager/')
  })
})
