import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const apiGetTerminalCommands = vi.fn()
/** One history file's worth of commands, as the backend reports it (see `TerminalHistorySource`). */
function zsh(...commands: string[]) {
  return [{ source: '.zsh_history', commands }]
}
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
    terminalHistorySnapshot: null,
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
})

describe('getLevelInfo', () => {
  // Display text (Git Novice, Git Apprentice, ...) is resolved from `rankId` via t() at render
  // time (RewardsTab.tsx) — see the RankId doc comment. This is the same split achievements.json
  // uses: game.store.ts holds stable, locale-independent ids, never translated strings.
  it.each([
    [0, 1, 'novice'],
    [49, 1, 'novice'],
    [50, 2, 'apprentice'],
    [119, 2, 'apprentice'],
    [120, 3, 'practitioner'],
    [199, 3, 'practitioner'],
    [200, 4, 'specialist'],
    [299, 4, 'specialist'],
    [300, 5, 'grandmaster'],
  ])('maps %i points to level %i (%s)', (points, level, rankId) => {
    const info = getLevelInfo(points)
    expect(info.level).toBe(level)
    expect(info.rankId).toBe(rankId)
  })

  it('overrides to the platinum level when the platinum trophy is unlocked, regardless of points', () => {
    const info = getLevelInfo(10, true)
    expect(info.level).toBe(5)
    expect(info.rankId).toBe('grandmasterPlatinum')
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

    useGameStore.getState().processAppEvent('open_launchpad') // already unlocked, but re-triggers a pass

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
  // The regression this suite exists for: reading the shell history is not a user action. Opening
  // the Rewards tab used to replay every git command the file held — `git diff`, `git bisect`,
  // `git log` — and unlock their trophies on the spot. See `lib/rewards/terminalHistory.ts`.
  it('unlocks nothing on the first read, whatever the shell history already holds', async () => {
    apiGetTerminalCommands.mockResolvedValue(zsh('git diff', 'git status', 'git bisect start'))
    await useGameStore.getState().checkTerminalHistory()

    const state = useGameStore.getState()
    expect(state.achievements.filter((a) => a.unlocked)).toEqual([])
    expect(state.points).toBe(0)
    expect(state.terminalCommandCount).toBe(0)
    // ...but it is now watching, from exactly what it saw.
    expect(state.terminalHistorySnapshot).toEqual({
      '.zsh_history': ['git diff', 'git status', 'git bisect start'],
    })
  })

  it('dispatches a terminal_command event for a command run after the baseline', async () => {
    apiGetTerminalCommands.mockResolvedValue(zsh('git diff'))
    await useGameStore.getState().checkTerminalHistory()

    apiGetTerminalCommands.mockResolvedValue(zsh('git diff', 'git status'))
    await useGameStore.getState().checkTerminalHistory()

    const state = useGameStore.getState()
    expect(state.achievements.find((a) => a.id === 'terminal_status')?.unlocked).toBe(true)
    // The baselined 'git diff' stays locked — the user never ran it while the app was watching.
    expect(state.achievements.find((a) => a.id === 'terminal_diff')?.unlocked).toBe(false)
    expect(state.terminalCommandCount).toBe(1)
  })

  it('does not re-dispatch a command already seen in the previous read', async () => {
    apiGetTerminalCommands.mockResolvedValue(zsh('git diff'))
    await useGameStore.getState().checkTerminalHistory()
    apiGetTerminalCommands.mockResolvedValue(zsh('git diff', 'git status'))
    await useGameStore.getState().checkTerminalHistory()
    await useGameStore.getState().checkTerminalHistory()
    expect(useGameStore.getState().terminalCommandCount).toBe(1)
  })

  it('does nothing when rewards are disabled', async () => {
    useGameStore.getState().setRewardsEnabled(false)
    apiGetTerminalCommands.mockResolvedValue(zsh('git status'))
    await useGameStore.getState().checkTerminalHistory()
    expect(apiGetTerminalCommands).not.toHaveBeenCalled()
  })

  it('treats an empty read as no read at all', async () => {
    apiGetTerminalCommands.mockResolvedValue([])
    await useGameStore.getState().checkTerminalHistory()
    // Not `[]`: the backend swallows its own read errors and zsh truncates the file while rewriting
    // it, so an empty result may simply be a failed read.
    expect(useGameStore.getState().terminalHistorySnapshot).toBeNull()
  })

  it('does not replay the history after a read that came back empty', async () => {
    apiGetTerminalCommands.mockResolvedValue(zsh('git status', 'git diff'))
    await useGameStore.getState().checkTerminalHistory()

    // A transient empty read (file being rewritten) must not become the snapshot — forgetting the
    // file would make the next successful read look like a history full of brand-new commands.
    apiGetTerminalCommands.mockResolvedValue([])
    await useGameStore.getState().checkTerminalHistory()
    apiGetTerminalCommands.mockResolvedValue(zsh('git status', 'git diff'))
    await useGameStore.getState().checkTerminalHistory()

    const state = useGameStore.getState()
    expect(state.terminalCommandCount).toBe(0)
    expect(state.achievements.filter((a) => a.unlocked)).toEqual([])
  })

  it('writes nothing when the history has not moved', async () => {
    // A fresh array per call, so identity below proves a `set` was skipped rather than that the
    // mock handed back the same instance twice.
    apiGetTerminalCommands.mockImplementation(async () => zsh('git status'))
    await useGameStore.getState().checkTerminalHistory()
    const snapshot = useGameStore.getState().terminalHistorySnapshot

    // The poll fires every 4s while the Rewards tab is open, and this store persists on write: an
    // unchanged read must not touch state at all.
    await useGameStore.getState().checkTerminalHistory()
    expect(useGameStore.getState().terminalHistorySnapshot).toBe(snapshot)
  })

  it('re-baselines instead of unlocking when the history it was watching disappeared', async () => {
    apiGetTerminalCommands.mockResolvedValue(zsh('git status'))
    await useGameStore.getState().checkTerminalHistory()

    // No overlap with the snapshot: cleared history, a rewritten file, or a burst longer than the
    // backend's window. Unexplained, so nothing is rewarded.
    apiGetTerminalCommands.mockResolvedValue(zsh('git diff', 'git bisect start'))
    await useGameStore.getState().checkTerminalHistory()

    const state = useGameStore.getState()
    expect(state.terminalCommandCount).toBe(0)
    expect(state.terminalHistorySnapshot).toEqual({
      '.zsh_history': ['git diff', 'git bisect start'],
    })
  })

  // The regression that made every terminal achievement unreachable for anyone holding git commands
  // in both history files: the backend used to merge them, so a new zsh command landed in the middle
  // of the merged list and read as a rewritten history. One file, one stream, one diff.
  it('credits a command appended to one history file while another file is unchanged', async () => {
    const bash = { source: '.bash_history', commands: ['git bash-only'] }
    apiGetTerminalCommands.mockResolvedValue([
      { source: '.zsh_history', commands: ['git diff'] },
      bash,
    ])
    await useGameStore.getState().checkTerminalHistory()

    apiGetTerminalCommands.mockResolvedValue([
      { source: '.zsh_history', commands: ['git diff', 'git status'] },
      bash,
    ])
    await useGameStore.getState().checkTerminalHistory()

    expect(useGameStore.getState().achievements.find((a) => a.id === 'terminal_status')?.unlocked)
      .toBe(true)
  })

  it('baselines a history file it sees for the first time without crediting it', async () => {
    apiGetTerminalCommands.mockResolvedValue([{ source: '.zsh_history', commands: ['git diff'] }])
    await useGameStore.getState().checkTerminalHistory()

    // A second shell's history appears (or comes back after being unreadable): everything it holds
    // predates the app watching it.
    apiGetTerminalCommands.mockResolvedValue([
      { source: '.zsh_history', commands: ['git diff'] },
      { source: '.bash_history', commands: ['git status', 'git bisect start'] },
    ])
    await useGameStore.getState().checkTerminalHistory()

    expect(useGameStore.getState().terminalCommandCount).toBe(0)
    expect(useGameStore.getState().achievements.filter((a) => a.unlocked)).toEqual([])
  })

  it('drops the snapshot when rewards are switched off, so re-enabling grants no backlog', async () => {
    apiGetTerminalCommands.mockResolvedValue(zsh('git status'))
    await useGameStore.getState().checkTerminalHistory()

    useGameStore.getState().setRewardsEnabled(false)
    expect(useGameStore.getState().terminalHistorySnapshot).toBeNull()

    useGameStore.getState().setRewardsEnabled(true)
    apiGetTerminalCommands.mockResolvedValue(zsh('git status', 'git diff', 'git bisect start'))
    await useGameStore.getState().checkTerminalHistory()
    expect(useGameStore.getState().terminalCommandCount).toBe(0)
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

  it('resetGameProgress re-baselines the shell history rather than replaying it', async () => {
    apiGetTerminalCommands.mockResolvedValue(zsh('git diff', 'git bisect start'))
    await useGameStore.getState().checkTerminalHistory()
    useGameStore.getState().resetGameProgress()
    expect(useGameStore.getState().terminalHistorySnapshot).toBeNull()

    // A reset used to empty the "already seen" list, which made the very next poll unlock every
    // terminal achievement the history contained all over again.
    await useGameStore.getState().checkTerminalHistory()
    expect(useGameStore.getState().achievements.filter((a) => a.unlocked)).toEqual([])
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

  it('keeps a per-file history snapshot', () => {
    const snapshot = { '.zsh_history': ['git diff'] }
    const merged = merge({ terminalHistorySnapshot: snapshot }, useGameStore.getState())
    expect(merged.terminalHistorySnapshot).toEqual(snapshot)
  })

  it.each([
    ['the flat list an earlier build wrote', ['git diff', 'git status']],
    ['a hand-edited value of the wrong type', 'git diff'],
    ['a file mapped to something that is not a list of commands', { '.zsh_history': 42 }],
  ])('drops a stale snapshot shape (%s) so it re-baselines', (_case, persisted) => {
    // Feeding one to `diffHistorySources` would key it by array index (or worse), match nothing, and
    // re-baseline on every poll — a silently dead feature rather than a visible error.
    const merged = merge({ terminalHistorySnapshot: persisted }, useGameStore.getState())
    expect(merged.terminalHistorySnapshot).toBeNull()
  })
})
