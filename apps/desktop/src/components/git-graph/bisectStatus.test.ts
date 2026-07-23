import { describe, it, expect } from 'vitest'
import type { BisectState } from '@git-manager/git-types'
import { buildBisectStatusMap } from './bisectStatus'

function state(overrides: Partial<BisectState>): BisectState {
  return {
    active: true,
    badTerm: 'bad',
    goodTerm: 'good',
    goodOids: [],
    skippedOids: [],
    ...overrides,
  }
}

describe('buildBisectStatusMap', () => {
  it('returns an empty map when no bisect is active', () => {
    expect(buildBisectStatusMap(null).size).toBe(0)
    expect(buildBisectStatusMap(state({ active: false })).size).toBe(0)
  })

  it('maps good, bad and skipped commits to their status', () => {
    const map = buildBisectStatusMap(
      state({ badOid: 'bad1', goodOids: ['good1', 'good2'], skippedOids: ['skip1'] })
    )
    expect(map.get('bad1')).toBe('bad')
    expect(map.get('good1')).toBe('good')
    expect(map.get('good2')).toBe('good')
    expect(map.get('skip1')).toBe('skip')
  })

  it('marks the current HEAD as under test while searching', () => {
    const map = buildBisectStatusMap(state({ currentOid: 'head1', badOid: 'bad1' }))
    expect(map.get('head1')).toBe('current')
  })

  it('uses firstBad status once the search resolves, not current', () => {
    const map = buildBisectStatusMap(
      state({ currentOid: 'culprit', firstBadOid: 'culprit', badOid: 'culprit' })
    )
    expect(map.get('culprit')).toBe('firstBad')
  })
})
