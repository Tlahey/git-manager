import { describe, it, expect } from 'vitest'
import { getRule } from './ruleRegistry'
import { ActionRule } from './rules/ActionRule'
import { MilestoneRule } from './rules/MilestoneRule'
import { TerminalKeywordRule } from './rules/TerminalKeywordRule'
import { PairEventRule } from './rules/PairEventRule'
import { CompositeRule } from './rules/CompositeRule'
import type { RuleKind } from './types'

describe('getRule', () => {
  it.each([
    ['action', ActionRule],
    ['milestone', MilestoneRule],
    ['terminal_keyword', TerminalKeywordRule],
    ['pair', PairEventRule],
    ['composite', CompositeRule],
  ] as [RuleKind, new () => unknown][])('maps %s to a %s instance', (kind, Ctor) => {
    expect(getRule(kind)).toBeInstanceOf(Ctor)
  })

  it('returns the same shared instance across repeated calls for a kind', () => {
    expect(getRule('action')).toBe(getRule('action'))
  })

  it("each rule's own .kind matches the key it's registered under", () => {
    const kinds: RuleKind[] = ['action', 'milestone', 'terminal_keyword', 'pair', 'composite']
    for (const kind of kinds) {
      expect(getRule(kind).kind).toBe(kind)
    }
  })
})
