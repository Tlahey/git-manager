import { describe, it, expect } from 'vitest'
import { MilestoneRule } from './MilestoneRule'
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
    kind: 'milestone',
    unlocked: false,
    ...overrides,
  }
}

function ctx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    event: 'commit',
    payload: undefined,
    counters: { commitCount: 0, prMergedCount: 0, terminalCommandCount: 0 },
    pairTracking: new Map(),
    allAchievements: [],
    ...overrides,
  }
}

describe('MilestoneRule', () => {
  const rule = new MilestoneRule()

  it('exposes its kind', () => {
    expect(rule.kind).toBe('milestone')
  })

  it('matches when the commit counter reaches milestoneValue on a commit event', () => {
    const a = achievement({ milestoneType: 'commit', milestoneValue: 5 })
    expect(rule.matches(a, ctx({ event: 'commit', counters: { commitCount: 5, prMergedCount: 0, terminalCommandCount: 0 } }))).toBe(true)
  })

  it('matches when the counter exceeds milestoneValue', () => {
    const a = achievement({ milestoneType: 'commit', milestoneValue: 5 })
    expect(rule.matches(a, ctx({ event: 'commit', counters: { commitCount: 10, prMergedCount: 0, terminalCommandCount: 0 } }))).toBe(true)
  })

  it('does not match when the counter is below milestoneValue', () => {
    const a = achievement({ milestoneType: 'commit', milestoneValue: 5 })
    expect(rule.matches(a, ctx({ event: 'commit', counters: { commitCount: 4, prMergedCount: 0, terminalCommandCount: 0 } }))).toBe(false)
  })

  it('matches pr_merged milestones on pr_closed_or_merged events', () => {
    const a = achievement({ milestoneType: 'pr_merged', milestoneValue: 1 })
    expect(
      rule.matches(a, ctx({ event: 'pr_closed_or_merged', counters: { commitCount: 0, prMergedCount: 1, terminalCommandCount: 0 } }))
    ).toBe(true)
  })

  it('does not match when the event does not correspond to the milestone type', () => {
    const a = achievement({ milestoneType: 'commit', milestoneValue: 1 })
    expect(rule.matches(a, ctx({ event: 'pr_closed_or_merged', counters: { commitCount: 5, prMergedCount: 5, terminalCommandCount: 0 } }))).toBe(
      false
    )
  })

  it('never matches terminal_command milestone type (handled by TerminalKeywordRule instead)', () => {
    const a = achievement({ milestoneType: 'terminal_command', milestoneValue: 1 })
    expect(rule.matches(a, ctx({ event: 'terminal_command' }))).toBe(false)
  })

  it('does not match when milestoneType or milestoneValue is missing', () => {
    expect(rule.matches(achievement({ milestoneType: undefined, milestoneValue: 1 }), ctx())).toBe(false)
    expect(rule.matches(achievement({ milestoneType: 'commit', milestoneValue: undefined }), ctx())).toBe(false)
  })
})
