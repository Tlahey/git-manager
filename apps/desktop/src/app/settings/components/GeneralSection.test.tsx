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

describe('GeneralSection — fetch & default branch', () => {
  it('defaults to auto-prune on, interval 0, and default branch "main"', () => {
    render(<GeneralSection />)
    expect(screen.getByTestId('settings-auto-prune')).toBeChecked()
    expect(screen.getByTestId('settings-auto-fetch-interval')).toHaveValue(0)
    expect(screen.getByTestId('settings-default-branch-name')).toHaveValue('main')
  })

  it('toggles auto-prune off', async () => {
    const user = userEvent.setup()
    render(<GeneralSection />)
    await user.click(screen.getByTestId('settings-auto-prune'))
    expect(useSettingsStore.getState().settings.git.autoPrune).toBe(false)
  })

  it('clamps the auto-fetch interval to the 0–60 range', async () => {
    const user = userEvent.setup()
    render(<GeneralSection />)
    const input = screen.getByTestId('settings-auto-fetch-interval')
    await user.clear(input)
    await user.type(input, '90')
    expect(useSettingsStore.getState().settings.git.autoFetchIntervalMinutes).toBe(60)
  })

  it('updates the default branch name', async () => {
    const user = userEvent.setup()
    render(<GeneralSection />)
    const input = screen.getByTestId('settings-default-branch-name')
    await user.clear(input)
    await user.type(input, 'trunk')
    expect(useSettingsStore.getState().settings.git.defaultBranchName).toBe('trunk')
  })
})

describe('GeneralSection — graph', () => {
  it('defaults to 2000 initial commits with lazy loading enabled', () => {
    render(<GeneralSection />)
    expect(screen.getByTestId('settings-initial-graph-commits')).toHaveValue(2000)
    expect(screen.getByTestId('settings-lazy-load-graph-commits')).toBeChecked()
  })

  it('updates the initial graph commit count', async () => {
    const user = userEvent.setup()
    render(<GeneralSection />)
    const input = screen.getByTestId('settings-initial-graph-commits')
    await user.clear(input)
    await user.type(input, '5000')
    expect(useSettingsStore.getState().settings.git.initialGraphCommits).toBe(5000)
  })

  it('clamps a below-minimum value up to 500 on blur', async () => {
    const user = userEvent.setup()
    render(<GeneralSection />)
    const input = screen.getByTestId('settings-initial-graph-commits')
    await user.clear(input)
    await user.type(input, '100')
    input.blur()
    expect(useSettingsStore.getState().settings.git.initialGraphCommits).toBe(500)
  })

  it('toggles lazy loading off', async () => {
    const user = userEvent.setup()
    render(<GeneralSection />)
    await user.click(screen.getByTestId('settings-lazy-load-graph-commits'))
    expect(useSettingsStore.getState().settings.git.lazyLoadGraphCommits).toBe(false)
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
