import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const apiRunTask = vi.fn()
vi.mock('../api/shell.api', () => ({ apiRunTask: (...args: unknown[]) => apiRunTask(...args) }))

import { useSettingsStore } from '../stores/settings.store'
import { useRepoUIStore } from '../stores/repoUI.store'
import { useRunTasks } from './useRunTasks'

const DEFAULT_SETTINGS = useSettingsStore.getState().settings

const TASKS = [
  { id: 'a', name: 'Launch', command: 'pnpm dev' },
  { id: 'b', name: 'Tests', command: 'pnpm test' },
]

beforeEach(() => {
  apiRunTask.mockReset()
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
  useRepoUIStore.getState().setActiveRepo('/repo')
})

function seedTasks(defaultId?: string, terminal = '') {
  const store = useSettingsStore.getState()
  store.setRepoSetting('/repo', 'runTasks', TASKS)
  if (defaultId) store.setRepoSetting('/repo', 'defaultRunTaskId', defaultId)
  store.updateSettings({ externalTools: { externalTerminalCommand: terminal } })
}

describe('useRunTasks', () => {
  it('has no tasks and no default when the repo has none configured', () => {
    const { result } = renderHook(() => useRunTasks())
    expect(result.current.hasTasks).toBe(false)
    expect(result.current.defaultTask).toBeUndefined()
  })

  it('uses the flagged default task', () => {
    seedTasks('b')
    const { result } = renderHook(() => useRunTasks())
    expect(result.current.hasTasks).toBe(true)
    expect(result.current.defaultTask).toEqual(TASKS[1])
  })

  it('falls back to the first task when no default is flagged', () => {
    seedTasks()
    const { result } = renderHook(() => useRunTasks())
    expect(result.current.defaultTask).toEqual(TASKS[0])
  })

  it('runs a task via apiRunTask with the active repo and configured terminal', async () => {
    seedTasks('a', '/Applications/iTerm.app')
    const { result } = renderHook(() => useRunTasks())
    await act(async () => {
      await result.current.runTask(TASKS[1])
    })
    expect(apiRunTask).toHaveBeenCalledWith('/repo', 'pnpm test', '/Applications/iTerm.app')
  })
})
