import { describe, it, expect } from 'vitest'
import { ActionRule } from './ActionRule'
import type { Achievement, RuleContext } from '../types'

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

function ctx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    event: 'discard',
    payload: undefined,
    counters: { commitCount: 0, prMergedCount: 0, terminalCommandCount: 0 },
    pairTracking: new Map(),
    allAchievements: [],
    ...overrides,
  }
}

describe('ActionRule', () => {
  const rule = new ActionRule()

  it('exposes its kind', () => {
    expect(rule.kind).toBe('action')
  })

  it('matches when achievement.event equals the fired event', () => {
    const a = achievement({ event: 'discard' })
    expect(rule.matches(a, ctx({ event: 'discard' }))).toBe(true)
  })

  it('does not match a different event', () => {
    const a = achievement({ event: 'discard' })
    expect(rule.matches(a, ctx({ event: 'fixup' }))).toBe(false)
  })

  it('does not match when the achievement declares no event', () => {
    const a = achievement({ event: undefined })
    expect(rule.matches(a, ctx({ event: 'discard' }))).toBe(false)
  })
})
