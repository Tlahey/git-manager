import { describe, it, expect } from 'vitest'
import { prStateKind, prStateVisual } from './prState'

describe('prStateKind', () => {
  it('is "merged" when merged_at is set (wins over everything)', () => {
    expect(prStateKind({ state: 'closed', draft: true, merged_at: '2026-01-01' })).toBe('merged')
  })

  it('is "closed" for a closed, unmerged PR', () => {
    expect(prStateKind({ state: 'closed', draft: false, merged_at: null })).toBe('closed')
  })

  it('is "draft" for an open draft', () => {
    expect(prStateKind({ state: 'open', draft: true, merged_at: null })).toBe('draft')
  })

  it('is "open" otherwise', () => {
    expect(prStateKind({ state: 'open', draft: false, merged_at: null })).toBe('open')
  })
})

describe('prStateVisual', () => {
  it('maps each kind to a label key, badge/icon classes, and an icon', () => {
    for (const kind of ['open', 'draft', 'closed', 'merged'] as const) {
      const v = prStateVisual(kind)
      expect(v.labelKey).toBe(`pr.state.${kind}`)
      expect(v.badgeClassName).toBeTruthy()
      expect(v.iconClassName).toBeTruthy()
      expect(v.icon).toBeDefined()
    }
  })
})
