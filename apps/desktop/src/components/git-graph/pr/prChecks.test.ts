import { describe, it, expect } from 'vitest'
import type { PrCheck, PrCheckCategory } from '../../../api/github.api'
import { summarizeChecks, groupChecks } from './prChecks'

function check(category: PrCheckCategory, name: string = category): PrCheck {
  return { name, category, isRequired: false }
}

describe('summarizeChecks', () => {
  it('is "none" for an empty list', () => {
    const s = summarizeChecks([])
    expect(s.kind).toBe('none')
    expect(s.total).toBe(0)
  })

  it('is "failure" when any check fails (even alongside successes)', () => {
    expect(summarizeChecks([check('success'), check('failure')]).kind).toBe('failure')
  })

  it('is "in_progress" when nothing fails but something is still running', () => {
    expect(summarizeChecks([check('success'), check('in_progress')]).kind).toBe('in_progress')
  })

  it('is "success" when everything is successful/skipped/neutral', () => {
    expect(summarizeChecks([check('success'), check('skipped'), check('neutral')]).kind).toBe(
      'success'
    )
  })

  it('counts each category', () => {
    const s = summarizeChecks([check('success'), check('success'), check('skipped')])
    expect(s.counts.success).toBe(2)
    expect(s.counts.skipped).toBe(1)
  })
})

describe('groupChecks', () => {
  it('buckets by category in attention order, dropping empty groups', () => {
    const groups = groupChecks([
      check('success', 's1'),
      check('failure', 'f1'),
      check('in_progress', 'p1'),
      check('success', 's2'),
    ])
    expect(groups.map((g) => g.category)).toEqual(['failure', 'in_progress', 'success'])
    expect(groups.find((g) => g.category === 'success')?.checks).toHaveLength(2)
  })
})
