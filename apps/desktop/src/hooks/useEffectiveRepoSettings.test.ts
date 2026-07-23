import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSettingsStore } from '../stores/settings.store'
import { useEffectiveRepoSettings } from './useEffectiveRepoSettings'

const DEFAULT_SETTINGS = useSettingsStore.getState().settings

beforeEach(() => {
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
})

function setGlobal(partial: {
  commitInstructions?: string
  commitPattern?: string
  theme?: string
}) {
  useSettingsStore.setState((s) => ({
    settings: {
      ...s.settings,
      git: {
        ...s.settings.git,
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
  it('returns inherited globals and built-in GitFlow defaults when repoPath is null', () => {
    setGlobal({ commitPattern: '^feat', theme: 'dark' })
    const { result } = renderHook(() => useEffectiveRepoSettings(null))
    expect(result.current).toEqual({
      protectedBranches: ['main', 'master', 'develop'],
      defaultBranchName: 'main',
      commitInstructions: '',
      commitPattern: '^feat',
      theme: 'dark',
      terminalBackground: '#000000',
      terminalForeground: '#e4e4e7',
      worktreeDefaultFiles: [],
      runTasks: [],
      defaultRunTaskId: undefined,
    })
  })

  it('resolves terminal colours to the global appearance value, or the repo override', () => {
    useSettingsStore.setState((s) => ({
      settings: {
        ...s.settings,
        appearance: { ...s.settings.appearance, terminalBackground: '#111111' },
      },
    }))
    const { result: inherited } = renderHook(() => useEffectiveRepoSettings('/repo'))
    expect(inherited.current.terminalBackground).toBe('#111111')
    expect(inherited.current.terminalForeground).toBe('#e4e4e7')

    useSettingsStore.getState().setRepoSetting('/repo', 'terminalBackground', '#abcdef')
    const { result } = renderHook(() => useEffectiveRepoSettings('/repo'))
    expect(result.current.terminalBackground).toBe('#abcdef')
    // The non-overridden colour still inherits the global value.
    expect(result.current.terminalForeground).toBe('#e4e4e7')
  })

  it('resolves the GitFlow fields to built-in defaults for a repo with no override', () => {
    setGlobal({ theme: 'light' })
    const { result } = renderHook(() => useEffectiveRepoSettings('/repo'))
    expect(result.current.protectedBranches).toEqual(['main', 'master', 'develop'])
    expect(result.current.defaultBranchName).toBe('main')
    // Globally-inherited fields still resolve.
    expect(result.current.theme).toBe('light')
  })

  it('resolves protectedBranches / defaultBranchName to the repo override', () => {
    setGlobal({ commitPattern: 'global', theme: 'dark' })
    useSettingsStore.getState().setRepoSetting('/repo', 'theme', 'dracula')
    useSettingsStore.getState().setRepoSetting('/repo', 'protectedBranches', ['release'])
    useSettingsStore.getState().setRepoSetting('/repo', 'defaultBranchName', 'trunk')
    const { result } = renderHook(() => useEffectiveRepoSettings('/repo'))
    expect(result.current.theme).toBe('dracula')
    expect(result.current.protectedBranches).toEqual(['release'])
    expect(result.current.defaultBranchName).toBe('trunk')
    // Non-overridden inherited fields still resolve to the global value.
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

  it('resolves worktreeDefaultFiles to the repo override, empty when unset (no global fallback)', () => {
    const { result: unset } = renderHook(() => useEffectiveRepoSettings('/repo'))
    expect(unset.current.worktreeDefaultFiles).toEqual([])
    useSettingsStore.getState().setRepoSetting('/repo', 'worktreeDefaultFiles', ['.env*'])
    const { result } = renderHook(() => useEffectiveRepoSettings('/repo'))
    expect(result.current.worktreeDefaultFiles).toEqual(['.env*'])
  })

  it('resolves runTasks / defaultRunTaskId to the repo override, empty/undefined when unset', () => {
    const { result: unset } = renderHook(() => useEffectiveRepoSettings('/repo'))
    expect(unset.current.runTasks).toEqual([])
    expect(unset.current.defaultRunTaskId).toBeUndefined()

    const tasks = [{ id: 'a', name: 'Launch', command: 'pnpm dev' }]
    useSettingsStore.getState().setRepoSetting('/repo', 'runTasks', tasks)
    useSettingsStore.getState().setRepoSetting('/repo', 'defaultRunTaskId', 'a')
    const { result } = renderHook(() => useEffectiveRepoSettings('/repo'))
    expect(result.current.runTasks).toEqual(tasks)
    expect(result.current.defaultRunTaskId).toBe('a')
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
