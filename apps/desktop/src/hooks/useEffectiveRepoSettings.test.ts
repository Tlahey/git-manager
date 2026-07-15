import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSettingsStore } from '../stores/settings.store'
import { useEffectiveRepoSettings } from './useEffectiveRepoSettings'

const DEFAULT_SETTINGS = useSettingsStore.getState().settings

beforeEach(() => {
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
})

function setGlobal(partial: {
  protectedBranches?: string[]
  commitInstructions?: string
  commitPattern?: string
  theme?: string
}) {
  useSettingsStore.setState((s) => ({
    settings: {
      ...s.settings,
      git: {
        ...s.settings.git,
        ...(partial.protectedBranches !== undefined && {
          protectedBranches: partial.protectedBranches,
        }),
        ...(partial.commitInstructions !== undefined && {
          commitInstructions: partial.commitInstructions,
        }),
        ...(partial.commitPattern !== undefined && { commitPattern: partial.commitPattern }),
      },
      appearance: {
        ...s.settings.appearance,
        ...(partial.theme !== undefined && { theme: partial.theme }),
      },
    },
  }))
}

describe('useEffectiveRepoSettings', () => {
  it('returns the global values when repoPath is null', () => {
    setGlobal({ protectedBranches: ['main'], commitPattern: '^feat', theme: 'dark' })
    const { result } = renderHook(() => useEffectiveRepoSettings(null))
    expect(result.current).toEqual({
      protectedBranches: ['main'],
      commitInstructions: '',
      commitPattern: '^feat',
      theme: 'dark',
    })
  })

  it('returns the global values for a repo with no overrides (backward-compat)', () => {
    setGlobal({ protectedBranches: ['main', 'develop'], theme: 'light' })
    const { result } = renderHook(() => useEffectiveRepoSettings('/repo'))
    expect(result.current.protectedBranches).toEqual(['main', 'develop'])
    expect(result.current.theme).toBe('light')
  })

  it('prefers a repo override over the global value, per field', () => {
    setGlobal({ protectedBranches: ['main'], commitPattern: 'global', theme: 'dark' })
    useSettingsStore.getState().setRepoSetting('/repo', 'theme', 'dracula')
    useSettingsStore.getState().setRepoSetting('/repo', 'protectedBranches', ['release'])
    const { result } = renderHook(() => useEffectiveRepoSettings('/repo'))
    expect(result.current.theme).toBe('dracula')
    expect(result.current.protectedBranches).toEqual(['release'])
    // Non-overridden fields still inherit the global value.
    expect(result.current.commitPattern).toBe('global')
  })

  it('treats an override equal to the global value as a real (distinct) override', () => {
    setGlobal({ theme: 'dark' })
    useSettingsStore.getState().setRepoSetting('/repo', 'theme', 'dark')
    const { result } = renderHook(() => useEffectiveRepoSettings('/repo'))
    expect(result.current.theme).toBe('dark')
    // The override entry exists even though the value matches global.
    expect(useSettingsStore.getState().settings.repoOverrides['/repo']).toEqual({ theme: 'dark' })
  })

  it('scopes overrides to the requested repo only', () => {
    setGlobal({ theme: 'dark' })
    useSettingsStore.getState().setRepoSetting('/a', 'theme', 'nord')
    const { result } = renderHook(() => useEffectiveRepoSettings('/b'))
    expect(result.current.theme).toBe('dark')
  })

  it('reacts to override changes across rerenders', () => {
    setGlobal({ theme: 'dark' })
    const { result, rerender } = renderHook(() => useEffectiveRepoSettings('/repo'))
    expect(result.current.theme).toBe('dark')
    useSettingsStore.getState().setRepoSetting('/repo', 'theme', 'light')
    rerender()
    expect(result.current.theme).toBe('light')
  })
})
