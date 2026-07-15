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

  it('resetSettingsGroups resets only the listed groups, leaving others untouched', () => {
    useSettingsStore.getState().updateSettings({
      ai: { ...DEFAULT_SETTINGS.ai, model: 'custom' },
      git: { ...DEFAULT_SETTINGS.git, protectedBranches: ['x'] },
      language: 'en',
    })
    useSettingsStore.getState().resetSettingsGroups(['git', 'ai'])
    const s = useSettingsStore.getState().settings
    expect(s.git).toEqual(DEFAULT_SETTINGS.git)
    expect(s.ai).toEqual(DEFAULT_SETTINGS.ai)
    // Not listed → preserved.
    expect(s.language).toBe('en')
  })

  it('resetSettingsFields resets only the listed fields within a group', () => {
    useSettingsStore.getState().updateSettings({
      git: {
        ...DEFAULT_SETTINGS.git,
        protectedBranches: ['x'],
        commitInstructions: 'keep me',
      },
    })
    useSettingsStore.getState().resetSettingsFields('git', ['protectedBranches'])
    const git = useSettingsStore.getState().settings.git
    expect(git.protectedBranches).toEqual(DEFAULT_SETTINGS.git.protectedBranches)
    // Other fields in the same group are untouched.
    expect(git.commitInstructions).toBe('keep me')
  })

  it('has AI enabled by default', () => {
    expect(useSettingsStore.getState().settings.ai.enabled).toBe(true)
  })

  it('persists to localStorage under its own key', () => {
    useSettingsStore.getState().updateSettings({ language: 'en' })
    const raw = localStorage.getItem('git-manager-settings')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!).state.settings.language).toBe('en')
  })
})

describe('useSettingsStore — per-repository overrides', () => {
  it('defaults to an empty repoOverrides map', () => {
    expect(useSettingsStore.getState().settings.repoOverrides).toEqual({})
  })

  it('setRepoSetting creates a repo entry and sets one field', () => {
    useSettingsStore.getState().setRepoSetting('/repo', 'theme', 'dracula')
    expect(useSettingsStore.getState().settings.repoOverrides['/repo']).toEqual({ theme: 'dracula' })
  })

  it('setRepoSetting merges additional fields into an existing repo entry', () => {
    useSettingsStore.getState().setRepoSetting('/repo', 'theme', 'dracula')
    useSettingsStore.getState().setRepoSetting('/repo', 'protectedBranches', ['main'])
    expect(useSettingsStore.getState().settings.repoOverrides['/repo']).toEqual({
      theme: 'dracula',
      protectedBranches: ['main'],
    })
  })

  it('setRepoSetting keeps repos independent', () => {
    useSettingsStore.getState().setRepoSetting('/a', 'theme', 'light')
    useSettingsStore.getState().setRepoSetting('/b', 'theme', 'nord')
    expect(useSettingsStore.getState().settings.repoOverrides['/a']).toEqual({ theme: 'light' })
    expect(useSettingsStore.getState().settings.repoOverrides['/b']).toEqual({ theme: 'nord' })
  })

  it('resetRepoSetting removes a single field but keeps the rest', () => {
    useSettingsStore.getState().setRepoSetting('/repo', 'theme', 'dracula')
    useSettingsStore.getState().setRepoSetting('/repo', 'commitPattern', '^feat: .+')
    useSettingsStore.getState().resetRepoSetting('/repo', 'theme')
    expect(useSettingsStore.getState().settings.repoOverrides['/repo']).toEqual({
      commitPattern: '^feat: .+',
    })
  })

  it('resetRepoSetting drops the whole repo entry once its last field is removed', () => {
    useSettingsStore.getState().setRepoSetting('/repo', 'theme', 'dracula')
    useSettingsStore.getState().resetRepoSetting('/repo', 'theme')
    expect(useSettingsStore.getState().settings.repoOverrides['/repo']).toBeUndefined()
  })

  it('resetRepoSetting is a no-op for an unknown repo/field', () => {
    const before = useSettingsStore.getState().settings
    useSettingsStore.getState().resetRepoSetting('/nope', 'theme')
    expect(useSettingsStore.getState().settings).toBe(before)
  })

  it('resetSettings clears all repo overrides', () => {
    useSettingsStore.getState().setRepoSetting('/repo', 'theme', 'dracula')
    useSettingsStore.getState().resetSettings()
    expect(useSettingsStore.getState().settings.repoOverrides).toEqual({})
  })
})

describe('mergeSettingsWithDefaults', () => {
  it('returns full defaults when nothing was persisted', () => {
    expect(mergeSettingsWithDefaults(undefined)).toEqual(DEFAULT_SETTINGS)
  })

  it('preserves a persisted repoOverrides map through rehydration', () => {
    const merged = mergeSettingsWithDefaults({
      repoOverrides: { '/repo': { theme: 'nord', protectedBranches: ['main'] } },
    } as unknown as Partial<typeof DEFAULT_SETTINGS>)
    expect(merged.repoOverrides).toEqual({
      '/repo': { theme: 'nord', protectedBranches: ['main'] },
    })
    // Other groups still come from defaults.
    expect(merged.appearance).toEqual(DEFAULT_SETTINGS.appearance)
  })

  it('fills an absent repoOverrides map from defaults (forward-compat for old snapshots)', () => {
    const merged = mergeSettingsWithDefaults({ language: 'en' })
    expect(merged.repoOverrides).toEqual({})
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
