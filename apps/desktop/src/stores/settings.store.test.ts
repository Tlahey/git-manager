import { describe, it, expect, beforeEach } from 'vitest'
import { mergeSettingsWithDefaults, useSettingsStore } from './settings.store'

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
    useSettingsStore
      .getState()
      .updateSettings({ appearance: { ...DEFAULT_SETTINGS.appearance, theme: 'light' } })
    expect(useSettingsStore.getState().settings.appearance.theme).toBe('light')
    expect(useSettingsStore.getState().settings.appearance.fontSize).toBe(
      DEFAULT_SETTINGS.appearance.fontSize
    )
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

describe('mergeSettingsWithDefaults', () => {
  it('returns full defaults when nothing was persisted', () => {
    expect(mergeSettingsWithDefaults(undefined)).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps persisted scalar values while filling missing groups from defaults', () => {
    const merged = mergeSettingsWithDefaults({ language: 'en' })
    expect(merged.language).toBe('en')
    expect(merged.appearance).toEqual(DEFAULT_SETTINGS.appearance)
    expect(merged.ai).toEqual(DEFAULT_SETTINGS.ai)
  })

  it('fills fields missing inside a persisted group (forward-compat for new settings)', () => {
    const merged = mergeSettingsWithDefaults({
      appearance: { theme: 'light' } as unknown as typeof DEFAULT_SETTINGS.appearance,
    })
    expect(merged.appearance.theme).toBe('light')
    // Fields the old snapshot didn't know about come from the defaults.
    expect(merged.appearance.fontSize).toBe(DEFAULT_SETTINGS.appearance.fontSize)
    expect(merged.appearance.rowHeight).toBe(DEFAULT_SETTINGS.appearance.rowHeight)
  })

  it('does not treat arrays as mergeable groups', () => {
    const merged = mergeSettingsWithDefaults({
      advanced: { ...DEFAULT_SETTINGS.advanced, scanExclusions: ['only-this'] },
    })
    expect(merged.advanced.scanExclusions).toEqual(['only-this'])
  })
})
