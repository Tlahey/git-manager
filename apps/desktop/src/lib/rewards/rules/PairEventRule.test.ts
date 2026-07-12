import { describe, it, expect } from 'vitest'
import { PairEventRule } from './PairEventRule'
import type { Achievement, RuleContext } from '../types'

function achievement(overrides: Partial<Achievement> = {}): Achievement {
  return {
    id: 'stage_unstage',
    title: 't',
    description: 'd',
    points: 10,
    type: 'bronze',
    difficulty: 'beginner',
    rewardDescription: 'r',
    kind: 'pair',
    unlocked: false,
    startEvent: 'stage',
    endEvent: 'unstage',
    ...overrides,
  }
}

function ctx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    event: 'stage',
    payload: undefined,
    counters: { commitCount: 0, prMergedCount: 0, terminalCommandCount: 0 },
    pairTracking: new Map(),
    allAchievements: [],
    ...overrides,
  }
}

describe('PairEventRule', () => {
  const rule = new PairEventRule()

  it('exposes its kind', () => {
    expect(rule.kind).toBe('pair')
  })

  it('records the file on the start event via track()', () => {
    const a = achievement()
    const pairTracking = new Map<string, Set<string>>()
    rule.track(a, ctx({ event: 'stage', payload: { filePath: 'foo.ts' }, pairTracking }))
    expect(pairTracking.get('stage_unstage')).toEqual(new Set(['foo.ts']))
  })

  it('track() is a no-op when the event is not the startEvent', () => {
    const a = achievement()
    const pairTracking = new Map<string, Set<string>>()
    rule.track(a, ctx({ event: 'unstage', payload: { filePath: 'foo.ts' }, pairTracking }))
    expect(pairTracking.has('stage_unstage')).toBe(false)
  })

  it('track() accumulates multiple distinct files under the same achievement id', () => {
    const a = achievement()
    const pairTracking = new Map<string, Set<string>>()
    rule.track(a, ctx({ event: 'stage', payload: { filePath: 'foo.ts' }, pairTracking }))
    rule.track(a, ctx({ event: 'stage', payload: { filePath: 'bar.ts' }, pairTracking }))
    expect(pairTracking.get('stage_unstage')).toEqual(new Set(['foo.ts', 'bar.ts']))
  })

  it('matches the end event for a file previously tracked by the start event', () => {
    const a = achievement()
    const pairTracking = new Map<string, Set<string>>([['stage_unstage', new Set(['foo.ts'])]])
    expect(
      rule.matches(a, ctx({ event: 'unstage', payload: { filePath: 'foo.ts' }, pairTracking }))
    ).toBe(true)
  })

  it('does not match the end event for a file never tracked', () => {
    const a = achievement()
    const pairTracking = new Map<string, Set<string>>([['stage_unstage', new Set(['foo.ts'])]])
    expect(
      rule.matches(a, ctx({ event: 'unstage', payload: { filePath: 'other.ts' }, pairTracking }))
    ).toBe(false)
  })

  it('does not match on an event other than endEvent', () => {
    const a = achievement()
    const pairTracking = new Map<string, Set<string>>([['stage_unstage', new Set(['foo.ts'])]])
    expect(
      rule.matches(a, ctx({ event: 'stage', payload: { filePath: 'foo.ts' }, pairTracking }))
    ).toBe(false)
  })

  it('falls back to a shared "default" key when payload has no filePath', () => {
    const a = achievement()
    const pairTracking = new Map<string, Set<string>>()
    rule.track(a, ctx({ event: 'stage', payload: undefined, pairTracking }))
    expect(pairTracking.get('stage_unstage')).toEqual(new Set(['default']))
    expect(rule.matches(a, ctx({ event: 'unstage', payload: undefined, pairTracking }))).toBe(true)
  })

  it('isolates tracking state per achievement id', () => {
    const a1 = achievement({ id: 'pair1', startEvent: 'stage', endEvent: 'unstage' })
    const a2 = achievement({ id: 'pair2', startEvent: 'stage', endEvent: 'unstage' })
    const pairTracking = new Map<string, Set<string>>()
    rule.track(a1, ctx({ event: 'stage', payload: { filePath: 'foo.ts' }, pairTracking }))
    expect(pairTracking.has('pair2')).toBe(false)
    expect(
      rule.matches(a2, ctx({ event: 'unstage', payload: { filePath: 'foo.ts' }, pairTracking }))
    ).toBe(false)
  })
})
