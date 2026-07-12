import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const apiGetTerminalCommands = vi.fn()
vi.mock('../api/shell.api', () => ({
  apiGetTerminalCommands: (...args: unknown[]) => apiGetTerminalCommands(...args),
}))

import { useGameStore, getLevelInfo } from './game.store'
import { appEventBus } from '../lib/appEventBus'

const INITIAL = useGameStore.getState()

function resetStore() {
  useGameStore.setState({
    achievements: INITIAL.achievements.map((a) => ({
      ...a,
      unlocked: false,
      unlockedAt: undefined,
    })),
    points: 0,
    recentUnlock: null,
    historyChecked: [],
    pairTracking: new Map(),
    rewardsEnabled: true,
    commitCount: 0,
    prMergedCount: 0,
    terminalCommandCount: 0,
  })
}

beforeEach(() => {
  resetStore()
  apiGetTerminalCommands.mockReset()
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('getLevelInfo', () => {
  it.each([
    [0, 1, 'Git Novice'],
    [49, 1, 'Git Novice'],
    [50, 2, 'Git Apprenti'],
    [119, 2, 'Git Apprenti'],
    [120, 3, 'Git Praticien'],
    [199, 3, 'Git Praticien'],
    [200, 4, 'Git Spécialiste'],
    [299, 4, 'Git Spécialiste'],
    [300, 5, 'Git Grand Maître'],
  ])('maps %i points to level %i (%s)', (points, level, name) => {
    const info = getLevelInfo(points)
    expect(info.level).toBe(level)
    expect(info.name).toBe(name)
  })

  it('overrides to the platinum level when the platinum trophy is unlocked, regardless of points', () => {
    const info = getLevelInfo(10, true)
    expect(info.level).toBe(5)
    expect(info.name).toContain('Platine')
  })
})

describe('useGameStore.processAppEvent', () => {
  it('unlocks a matching action achievement and awards its points', () => {
    useGameStore.getState().processAppEvent('discard')
    const state = useGameStore.getState()
    expect(state.achievements.find((a) => a.id === 'discard')?.unlocked).toBe(true)
    expect(state.points).toBe(15)
    expect(state.recentUnlock?.id).toBe('discard')
  })

  it('does nothing when rewards are disabled', () => {
    useGameStore.getState().setRewardsEnabled(false)
    useGameStore.getState().processAppEvent('discard')
    expect(useGameStore.getState().achievements.find((a) => a.id === 'discard')?.unlocked).toBe(
      false
    )
    expect(useGameStore.getState().points).toBe(0)
  })

  it('increments commitCount and unlocks the first-commit milestone', () => {
    useGameStore.getState().processAppEvent('commit')
    const state = useGameStore.getState()
    expect(state.commitCount).toBe(1)
    expect(state.achievements.find((a) => a.id === 'commit_1')?.unlocked).toBe(true)
  })

  it('does not re-unlock or re-award points for an already-unlocked achievement', () => {
    useGameStore.getState().processAppEvent('discard')
    const pointsAfterFirst = useGameStore.getState().points
    useGameStore.getState().processAppEvent('discard')
    expect(useGameStore.getState().points).toBe(pointsAfterFirst)
  })

  it('only reports (does not immediately unlock) a composite achievement whose condition just became true', () => {
    // Unlock every non-composite achievement directly, leaving only platinum_trophy locked.
    useGameStore.setState((state) => ({
      achievements: state.achievements.map((a) =>
        a.kind === 'composite' ? a : { ...a, unlocked: true }
      ),
    }))

    useGameStore.getState().processAppEvent('open_app') // re-fires open_launchpad's event; already unlocked, but re-triggers a pass

    expect(
      useGameStore.getState().achievements.find((a) => a.id === 'platinum_trophy')?.unlocked
    ).toBe(false)

    vi.advanceTimersByTime(1000)

    expect(
      useGameStore.getState().achievements.find((a) => a.id === 'platinum_trophy')?.unlocked
    ).toBe(true)
    expect(useGameStore.getState().recentUnlock?.id).toBe('platinum_trophy')
  })
})

describe('useGameStore — appEventBus interoperability', () => {
  it('reacts to events notified through the shared appEventBus, not just direct calls', () => {
    appEventBus.notify('discard')
    expect(useGameStore.getState().achievements.find((a) => a.id === 'discard')?.unlocked).toBe(
      true
    )
  })
})

describe('useGameStore.checkTerminalHistory', () => {
  it('dispatches a terminal_command event for each newly seen command and records it as checked', async () => {
    apiGetTerminalCommands.mockResolvedValue(['git status', 'git status'])
    await useGameStore.getState().checkTerminalHistory()

    const state = useGameStore.getState()
    expect(state.historyChecked).toEqual(['git status', 'git status'])
    expect(state.achievements.find((a) => a.id === 'terminal_status')?.unlocked).toBe(true)
  })

  it('does not re-dispatch a command already in historyChecked', async () => {
    apiGetTerminalCommands.mockResolvedValue(['git status'])
    await useGameStore.getState().checkTerminalHistory()
    await useGameStore.getState().checkTerminalHistory()
    expect(useGameStore.getState().terminalCommandCount).toBe(1)
  })

  it('does nothing when rewards are disabled', async () => {
    useGameStore.getState().setRewardsEnabled(false)
    apiGetTerminalCommands.mockResolvedValue(['git status'])
    await useGameStore.getState().checkTerminalHistory()
    expect(apiGetTerminalCommands).not.toHaveBeenCalled()
  })

  it('does nothing when there is no history yet', async () => {
    apiGetTerminalCommands.mockResolvedValue([])
    await useGameStore.getState().checkTerminalHistory()
    expect(useGameStore.getState().historyChecked).toEqual([])
  })

  it('warns and does not throw when the backend call fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    apiGetTerminalCommands.mockRejectedValue(new Error('no shell history file'))
    await expect(useGameStore.getState().checkTerminalHistory()).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalled()
  })
})

describe('useGameStore — misc actions', () => {
  it('clearRecentUnlock resets the toast slot', () => {
    useGameStore.getState().processAppEvent('discard')
    expect(useGameStore.getState().recentUnlock).not.toBeNull()
    useGameStore.getState().clearRecentUnlock()
    expect(useGameStore.getState().recentUnlock).toBeNull()
  })

  it('resetGameProgress restores every achievement to locked and zeroes counters/points', () => {
    useGameStore.getState().processAppEvent('discard')
    useGameStore.getState().processAppEvent('commit')
    useGameStore.getState().resetGameProgress()

    const state = useGameStore.getState()
    expect(state.points).toBe(0)
    expect(state.commitCount).toBe(0)
    expect(state.achievements.every((a) => !a.unlocked)).toBe(true)
    expect(state.recentUnlock).toBeNull()
  })
})

describe('useGameStore — persisted-state merge', () => {
  const merge = (
    useGameStore.persist.getOptions() as unknown as {
      merge: (
        persisted: unknown,
        current: ReturnType<typeof useGameStore.getState>
      ) => ReturnType<typeof useGameStore.getState>
    }
  ).merge

  it('keeps unlocked/unlockedAt from persisted achievements matched by id', () => {
    const persisted = {
      achievements: [{ id: 'discard', unlocked: true, unlockedAt: 123 }],
      points: 15,
    }
    const merged = merge(persisted, useGameStore.getState())
    const discard = merged.achievements.find((a) => a.id === 'discard')
    expect(discard?.unlocked).toBe(true)
    expect(discard?.unlockedAt).toBe(123)
    // Static fields still come from the current code's achievement definitions, not the saved blob.
    expect(discard?.points).toBe(15)
  })

  it('defaults achievements missing from persisted state to locked', () => {
    const merged = merge({ achievements: [] }, useGameStore.getState())
    expect(merged.achievements.every((a) => !a.unlocked)).toBe(true)
  })

  it('falls back to the current (default) state when there is no persisted state', () => {
    const merged = merge(undefined, useGameStore.getState())
    expect(merged.achievements).toEqual(useGameStore.getState().achievements)
  })
})
