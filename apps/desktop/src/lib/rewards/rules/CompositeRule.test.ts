import { describe, it, expect } from 'vitest'
import { CompositeRule } from './CompositeRule'
import type { Achievement, RuleContext } from '../types'

function achievement(overrides: Partial<Achievement> = {}): Achievement {
  return {
    id: 'a1',
    title: 't',
    description: 'd',
    points: 10,
    type: 'platinum',
    difficulty: 'expert',
    rewardDescription: 'r',
    kind: 'composite',
    unlocked: false,
    ...overrides,
  }
}

function ctx(allAchievements: Achievement[]): RuleContext {
  return {
    event: 'commit',
    payload: undefined,
    counters: { commitCount: 0, prMergedCount: 0, terminalCommandCount: 0 },
    pairTracking: new Map(),
    allAchievements,
  }
}

describe('CompositeRule', () => {
  const rule = new CompositeRule()

  it('exposes its kind', () => {
    expect(rule.kind).toBe('composite')
  })

  it('does not match when the achievement declares no requiresAllExcept', () => {
    const a = achievement({ requiresAllExcept: undefined })
    expect(rule.matches(a, ctx([a]))).toBe(false)
  })

  it('matches once every other achievement is unlocked', () => {
    const platinum = achievement({ id: 'platinum_trophy', requiresAllExcept: ['platinum_trophy'] })
    const others = [
      achievement({ id: 'a', unlocked: true, kind: 'action' }),
      achievement({ id: 'b', unlocked: true, kind: 'action' }),
    ]
    expect(rule.matches(platinum, ctx([platinum, ...others]))).toBe(true)
  })

  it('does not match while some other achievement is still locked', () => {
    const platinum = achievement({ id: 'platinum_trophy', requiresAllExcept: ['platinum_trophy'] })
    const others = [
      achievement({ id: 'a', unlocked: true, kind: 'action' }),
      achievement({ id: 'b', unlocked: false, kind: 'action' }),
    ]
    expect(rule.matches(platinum, ctx([platinum, ...others]))).toBe(false)
  })

  it('excludes ids listed in requiresAllExcept beyond its own id', () => {
    const composite = achievement({ id: 'meta', requiresAllExcept: ['meta', 'excluded'] })
    const others = [
      achievement({ id: 'excluded', unlocked: false, kind: 'action' }),
      achievement({ id: 'included', unlocked: true, kind: 'action' }),
    ]
    expect(rule.matches(composite, ctx([composite, ...others]))).toBe(true)
  })

  it('ignores ctx.event entirely', () => {
    const composite = achievement({ id: 'meta', requiresAllExcept: ['meta'] })
    const context = { ...ctx([composite]), event: 'terminal_command' as const }
    expect(rule.matches(composite, context)).toBe(true)
  })
})
