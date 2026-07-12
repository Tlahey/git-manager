import { describe, it, expect } from 'vitest'
import { processEvent, unlockAchievementById, type RewardEngineState } from './rewardEngine'
import type { Achievement } from './types'

function achievement(overrides: Partial<Achievement> = {}): Achievement {
  return {
    id: 'a1',
    title: 't',
    description: 'd',
    points: 10,
    type: 'bronze',
    difficulty: 'beginner',
    rewardDescription: 'r',
    kind: 'action',
    unlocked: false,
    ...overrides,
  }
}

function state(
  achievements: Achievement[],
  overrides: Partial<RewardEngineState> = {}
): RewardEngineState {
  return {
    achievements,
    points: 0,
    commitCount: 0,
    prMergedCount: 0,
    terminalCommandCount: 0,
    pairTracking: new Map(),
    ...overrides,
  }
}

describe('unlockAchievementById', () => {
  it('unlocks an existing, locked achievement and adds its points', () => {
    const a = achievement({ id: 'a', points: 25, unlocked: false })
    const result = unlockAchievementById([a], 100, 'a')
    expect(result).not.toBeNull()
    expect(result!.points).toBe(125)
    expect(result!.unlocked).toMatchObject({ id: 'a', unlocked: true })
    expect(result!.unlocked.unlockedAt).toEqual(expect.any(Number))
    expect(result!.achievements.find((x) => x.id === 'a')!.unlocked).toBe(true)
  })

  it('returns null for an unknown id', () => {
    expect(unlockAchievementById([achievement({ id: 'a' })], 0, 'missing')).toBeNull()
  })

  it('returns null when already unlocked', () => {
    const a = achievement({ id: 'a', unlocked: true })
    expect(unlockAchievementById([a], 0, 'a')).toBeNull()
  })

  it('returns null when the prerequisite is not yet unlocked', () => {
    const prereq = achievement({ id: 'prereq', unlocked: false })
    const gated = achievement({ id: 'gated', prerequisiteId: 'prereq', unlocked: false })
    expect(unlockAchievementById([prereq, gated], 0, 'gated')).toBeNull()
  })

  it('unlocks when the prerequisite is satisfied', () => {
    const prereq = achievement({ id: 'prereq', unlocked: true })
    const gated = achievement({ id: 'gated', prerequisiteId: 'prereq', unlocked: false })
    const result = unlockAchievementById([prereq, gated], 0, 'gated')
    expect(result).not.toBeNull()
    expect(result!.unlocked.id).toBe('gated')
  })

  it('does not mutate the input achievements array', () => {
    const a = achievement({ id: 'a', unlocked: false })
    const list = [a]
    unlockAchievementById(list, 0, 'a')
    expect(list[0].unlocked).toBe(false)
  })
})

describe('processEvent — single rule kinds', () => {
  it('unlocks an action achievement on its matching event', () => {
    const a = achievement({ id: 'discarder', kind: 'action', event: 'discard' })
    const result = processEvent(state([a]), 'discard', undefined)
    expect(result.newlyUnlocked.map((x) => x.id)).toEqual(['discarder'])
    expect(result.nextState.achievements.find((x) => x.id === 'discarder')!.unlocked).toBe(true)
  })

  it('increments the commit counter and unlocks a milestone at threshold', () => {
    const a = achievement({
      id: 'committer',
      kind: 'milestone',
      milestoneType: 'commit',
      milestoneValue: 2,
    })
    const afterFirst = processEvent(state([a], { commitCount: 0 }), 'commit', undefined)
    expect(afterFirst.newlyUnlocked).toHaveLength(0)
    expect(afterFirst.nextState.commitCount).toBe(1)

    const afterSecond = processEvent(afterFirst.nextState, 'commit', undefined)
    expect(afterSecond.nextState.commitCount).toBe(2)
    expect(afterSecond.newlyUnlocked.map((x) => x.id)).toEqual(['committer'])
  })

  it('unlocks a terminal_keyword achievement on a matching command', () => {
    const a = achievement({
      id: 'reflogger',
      kind: 'terminal_keyword',
      commandKeyword: 'git reflog',
    })
    const result = processEvent(state([a]), 'terminal_command', { command: 'git reflog show' })
    expect(result.newlyUnlocked.map((x) => x.id)).toEqual(['reflogger'])
    expect(result.nextState.terminalCommandCount).toBe(1)
  })

  it('does not re-unlock (or re-track) an already-unlocked achievement', () => {
    const a = achievement({ id: 'discarder', kind: 'action', event: 'discard', unlocked: true })
    const result = processEvent(state([a]), 'discard', undefined)
    expect(result.newlyUnlocked).toHaveLength(0)
  })
})

describe('processEvent — pair rule state carried across calls', () => {
  it('unlocks a pair achievement when the end event follows the start event for the same file', () => {
    const a = achievement({
      id: 'stage_unstage',
      kind: 'pair',
      startEvent: 'stage',
      endEvent: 'unstage',
    })
    const afterStage = processEvent(state([a]), 'stage', { filePath: 'foo.ts' })
    expect(afterStage.newlyUnlocked).toHaveLength(0)
    expect(afterStage.nextState.pairTracking.get('stage_unstage')).toEqual(new Set(['foo.ts']))

    const afterUnstage = processEvent(afterStage.nextState, 'unstage', { filePath: 'foo.ts' })
    expect(afterUnstage.newlyUnlocked.map((x) => x.id)).toEqual(['stage_unstage'])
  })

  it('does not unlock the pair achievement for a different file', () => {
    const a = achievement({
      id: 'stage_unstage',
      kind: 'pair',
      startEvent: 'stage',
      endEvent: 'unstage',
    })
    const afterStage = processEvent(state([a]), 'stage', { filePath: 'foo.ts' })
    const afterUnstage = processEvent(afterStage.nextState, 'unstage', { filePath: 'bar.ts' })
    expect(afterUnstage.newlyUnlocked).toHaveLength(0)
  })

  it('does not mutate the pairTracking map of the previous state (nextState is a fresh clone)', () => {
    const a = achievement({
      id: 'stage_unstage',
      kind: 'pair',
      startEvent: 'stage',
      endEvent: 'unstage',
    })
    const initial = state([a])
    const afterStage = processEvent(initial, 'stage', { filePath: 'foo.ts' })
    expect(initial.pairTracking.size).toBe(0)
    expect(afterStage.nextState.pairTracking).not.toBe(initial.pairTracking)
  })
})

describe('processEvent — composite achievements', () => {
  it('reports a composite achievement as pending rather than unlocking it immediately', () => {
    const platinum = achievement({
      id: 'platinum_trophy',
      kind: 'composite',
      requiresAllExcept: ['platinum_trophy'],
    })
    const last = achievement({ id: 'last_one', kind: 'action', event: 'discard', unlocked: false })
    const result = processEvent(state([platinum, last]), 'discard', undefined)

    expect(result.newlyUnlocked.map((x) => x.id)).toEqual(['last_one'])
    expect(result.pendingComposites.map((x) => x.id)).toEqual(['platinum_trophy'])
    expect(result.nextState.achievements.find((x) => x.id === 'platinum_trophy')!.unlocked).toBe(
      false
    )
  })

  it('does not report a composite as pending while other achievements remain locked', () => {
    const platinum = achievement({
      id: 'platinum_trophy',
      kind: 'composite',
      requiresAllExcept: ['platinum_trophy'],
    })
    const other = achievement({ id: 'other', kind: 'action', event: 'fixup', unlocked: false })
    const result = processEvent(state([platinum, other]), 'discard', undefined)
    expect(result.pendingComposites).toHaveLength(0)
  })

  it('does not re-report an already-unlocked composite as pending', () => {
    const platinum = achievement({
      id: 'platinum_trophy',
      kind: 'composite',
      requiresAllExcept: ['platinum_trophy'],
      unlocked: true,
    })
    const result = processEvent(state([platinum]), 'discard', undefined)
    expect(result.pendingComposites).toHaveLength(0)
  })
})

describe('processEvent — points and immutability across the whole engine', () => {
  it('accumulates points across achievements unlocked by the same event', () => {
    const a = achievement({ id: 'a', kind: 'action', event: 'discard', points: 10 })
    const b = achievement({ id: 'b', kind: 'action', event: 'discard', points: 15 })
    const result = processEvent(state([a, b], { points: 5 }), 'discard', undefined)
    expect(result.nextState.points).toBe(30)
    expect(result.newlyUnlocked).toHaveLength(2)
  })

  it('does not mutate the input state object', () => {
    const a = achievement({ id: 'a', kind: 'action', event: 'discard' })
    const initial = state([a])
    processEvent(initial, 'discard', undefined)
    expect(initial.achievements[0].unlocked).toBe(false)
  })

  it('leaves counters for unrelated events untouched', () => {
    const a = achievement({ id: 'a', kind: 'action', event: 'open_app' })
    const result = processEvent(state([a]), 'open_app', undefined)
    expect(result.nextState.commitCount).toBe(0)
    expect(result.nextState.prMergedCount).toBe(0)
    expect(result.nextState.terminalCommandCount).toBe(0)
  })
})
