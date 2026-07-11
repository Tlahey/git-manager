import { describe, it, expect, beforeEach } from 'vitest'
import { useSettingsStore } from './settings.store'

const DEFAULT_SETTINGS = useSettingsStore.getState().settings

beforeEach(() => {
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
  localStorage.clear()
})

describe('useSettingsStore', () => {
  it('starts with sensible defaults', () => {
    expect(useSettingsStore.getState().settings.appearance.theme).toBe('dark')
    expect(useSettingsStore.getState().settings.language).toBe('fr')
  })

  it('updateSettings shallow-merges a partial update into the existing settings', () => {
    useSettingsStore.getState().updateSettings({ language: 'en' })
    const settings = useSettingsStore.getState().settings
    expect(settings.language).toBe('en')
    // Untouched top-level sections survive the merge.
    expect(settings.appearance).toEqual(DEFAULT_SETTINGS.appearance)
  })

  it('updateSettings replaces an entire nested section rather than deep-merging it', () => {
    useSettingsStore.getState().updateSettings({ appearance: { ...DEFAULT_SETTINGS.appearance, theme: 'light' } })
    expect(useSettingsStore.getState().settings.appearance.theme).toBe('light')
    expect(useSettingsStore.getState().settings.appearance.fontSize).toBe(DEFAULT_SETTINGS.appearance.fontSize)
  })

  it('resetSettings restores the full default settings object', () => {
    useSettingsStore.getState().updateSettings({ language: 'en' })
    useSettingsStore.getState().resetSettings()
    expect(useSettingsStore.getState().settings).toEqual(DEFAULT_SETTINGS)
  })

  it('persists to localStorage under its own key', () => {
    useSettingsStore.getState().updateSettings({ language: 'en' })
    const raw = localStorage.getItem('git-manager-settings')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!).state.settings.language).toBe('en')
  })
})
