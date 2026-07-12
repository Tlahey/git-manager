import { describe, it, expect } from 'vitest'
import { TerminalKeywordRule } from './TerminalKeywordRule'
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
    kind: 'terminal_keyword',
    unlocked: false,
    ...overrides,
  }
}

function ctx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    event: 'terminal_command',
    payload: undefined,
    counters: { commitCount: 0, prMergedCount: 0, terminalCommandCount: 0 },
    pairTracking: new Map(),
    allAchievements: [],
    ...overrides,
  }
}

describe('TerminalKeywordRule', () => {
  const rule = new TerminalKeywordRule()

  it('exposes its kind', () => {
    expect(rule.kind).toBe('terminal_keyword')
  })

  it('matches a case-insensitive substring of the command', () => {
    const a = achievement({ commandKeyword: 'git reflog' })
    expect(rule.matches(a, ctx({ payload: { command: 'GIT REFLOG --all' } }))).toBe(true)
  })

  it('does not match when the keyword is absent from the command', () => {
    const a = achievement({ commandKeyword: 'git reflog' })
    expect(rule.matches(a, ctx({ payload: { command: 'git status' } }))).toBe(false)
  })

  it('does not match on events other than terminal_command', () => {
    const a = achievement({ commandKeyword: 'git reflog' })
    expect(rule.matches(a, ctx({ event: 'commit', payload: { command: 'git reflog' } }))).toBe(
      false
    )
  })

  it('does not match when the achievement has no commandKeyword', () => {
    const a = achievement({ commandKeyword: undefined })
    expect(rule.matches(a, ctx({ payload: { command: 'git reflog' } }))).toBe(false)
  })

  it('does not match with an empty or malformed payload', () => {
    const a = achievement({ commandKeyword: 'git reflog' })
    expect(rule.matches(a, ctx({ payload: undefined }))).toBe(false)
    expect(rule.matches(a, ctx({ payload: {} }))).toBe(false)
    expect(rule.matches(a, ctx({ payload: { command: '   ' } }))).toBe(false)
    expect(rule.matches(a, ctx({ payload: { command: 123 } }))).toBe(false)
  })
})
