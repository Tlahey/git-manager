import { describe, it, expect } from 'vitest'
import type { BoardTag } from '@git-manager/git-types'
import {
  MAX_STRIPE_BANDS,
  cardIdentifier,
  dodProgress,
  isOverdue,
  priorityRank,
  resolveCardTags,
  tagStripeBackground,
} from './cardMeta'

const RED = '#ff0000'
const GREEN = '#00ff00'
const BLUE = '#0000ff'

function tag(id: string, color: string): BoardTag {
  return { id, name: id, color }
}

describe('dodProgress', () => {
  it('reports nothing to do for an empty checklist', () => {
    expect(dodProgress('')).toEqual({ done: 0, total: 0, percent: 0 })
  })

  it('counts ticked and unticked items', () => {
    expect(dodProgress('- [x] One\n- [ ] Two\n- [ ] Three')).toEqual({
      done: 1,
      total: 3,
      percent: 33,
    })
  })

  it('accepts every GFM bullet and a capital X, like GitHub does', () => {
    expect(dodProgress('* [X] One\n+ [ ] Two\n  - [x] Nested')).toEqual({
      done: 2,
      total: 3,
      percent: 67,
    })
  })

  it('ignores prose and non-checkbox bullets', () => {
    expect(dodProgress('Some notes\n\n- A plain bullet\n- [ ] A real item')).toEqual({
      done: 0,
      total: 1,
      percent: 0,
    })
  })

  it('reports 100% when everything is ticked', () => {
    expect(dodProgress('- [x] One\n- [x] Two').percent).toBe(100)
  })
})

describe('isOverdue', () => {
  const today = new Date(2026, 7, 4) // 4 August 2026, local time

  it('is not overdue without a due date', () => {
    expect(isOverdue(undefined, today)).toBe(false)
  })

  it('is not overdue on the due date itself', () => {
    expect(isOverdue('2026-08-04', today)).toBe(false)
  })

  it('is overdue the day after', () => {
    expect(isOverdue('2026-08-03', today)).toBe(true)
  })

  it('is not overdue for a future date', () => {
    expect(isOverdue('2026-08-05', today)).toBe(false)
  })

  it('pads single-digit months and days rather than comparing 2026-8-4', () => {
    // A naive string build would produce "2026-8-4", which sorts after "2026-08-10".
    expect(isOverdue('2026-08-10', new Date(2026, 7, 4))).toBe(false)
  })
})

describe('priorityRank', () => {
  it('orders high before normal before low', () => {
    const sorted = (['low', 'high', 'normal'] as const)
      .slice()
      .sort((a, b) => priorityRank(a) - priorityRank(b))
    expect(sorted).toEqual(['high', 'normal', 'low'])
  })
})

describe('resolveCardTags', () => {
  const board = { tags: [tag('a', RED), tag('b', GREEN), tag('c', BLUE)] }

  it('returns the tags in the board’s order, not the card’s', () => {
    const resolved = resolveCardTags(board, { tagIds: ['c', 'a'] })
    expect(resolved.map((t) => t.id)).toEqual(['a', 'c'])
  })

  it('drops ids that are no longer in the palette', () => {
    expect(resolveCardTags(board, { tagIds: ['a', 'deleted'] }).map((t) => t.id)).toEqual(['a'])
  })
})

describe('tagStripeBackground', () => {
  it('gives an untagged card no stripe at all', () => {
    expect(tagStripeBackground([])).toBeUndefined()
  })

  it('paints a single tag as a solid colour', () => {
    expect(tagStripeBackground([tag('a', RED)])).toBe(RED)
  })

  it('splits two tags into equal hard-edged bands', () => {
    expect(tagStripeBackground([tag('a', RED), tag('b', GREEN)])).toBe(
      `linear-gradient(to bottom, ${RED} 0.00%, ${RED} 50.00%, ${GREEN} 50.00%, ${GREEN} 100.00%)`
    )
  })

  it('repeats each stop so the boundaries stay crisp instead of blending', () => {
    const gradient = tagStripeBackground([tag('a', RED), tag('b', GREEN), tag('c', BLUE)])!
    // Every colour appears exactly twice: once opening its band, once closing it.
    for (const color of [RED, GREEN, BLUE]) {
      expect(gradient.split(color).length - 1).toBe(2)
    }
  })

  it('caps the bands, leaving the extra tags to the chip row', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => tag(id, RED))
    const gradient = tagStripeBackground(many)!
    const bands = (gradient.match(/%/g) ?? []).length / 2
    expect(bands).toBe(MAX_STRIPE_BANDS)
  })
})

describe('cardIdentifier', () => {
  it('joins the card’s own prefix and its number', () => {
    expect(cardIdentifier({ prefix: 'GM', number: 1 })).toBe('GM-1')
    expect(cardIdentifier({ prefix: 'OPS', number: 42 })).toBe('OPS-42')
  })

  it('gives nothing for a card created without a prefix', () => {
    expect(cardIdentifier({ prefix: '', number: 3 })).toBeUndefined()
  })

  /** A card written before the counter existed has number 0 — "GM-0" would be a lie. */
  it('gives nothing for a card that predates the counter', () => {
    expect(cardIdentifier({ prefix: 'GM', number: 0 })).toBeUndefined()
  })
})
