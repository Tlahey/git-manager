import { describe, it, expect } from 'vitest'
import type { BoardTag } from '@git-manager/git-types'
import {
  cardIdentifier,
  dodProgress,
  dueDateShortcuts,
  hexToRgb,
  issueReference,
  isOverdue,
  priorityRank,
  readableTextOn,
  resolveCardTags,
  toDateKey,
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

describe('toDateKey', () => {
  it('pads single-digit months and days', () => {
    expect(toDateKey(new Date(2026, 7, 4))).toBe('2026-08-04')
  })

  /** `toISOString()` converts to UTC first, which hands back yesterday for anyone west of
   * Greenwich for part of every day. */
  it('reads the local calendar rather than UTC', () => {
    expect(toDateKey(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01')
    expect(toDateKey(new Date(2026, 0, 1, 23, 30))).toBe('2026-01-01')
  })
})

describe('dueDateShortcuts', () => {
  it('offers today, tomorrow and the same day next week', () => {
    expect(dueDateShortcuts(new Date(2026, 7, 4))).toEqual([
      { key: 'today', date: '2026-08-04' },
      { key: 'tomorrow', date: '2026-08-05' },
      { key: 'nextWeek', date: '2026-08-11' },
    ])
  })

  it('rolls over a month end', () => {
    expect(dueDateShortcuts(new Date(2026, 7, 31)).map((s) => s.date)).toEqual([
      '2026-08-31',
      '2026-09-01',
      '2026-09-07',
    ])
  })

  it('counts through a leap day', () => {
    expect(dueDateShortcuts(new Date(2028, 1, 28)).map((s) => s.date)).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-06',
    ])
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

describe('hexToRgb', () => {
  it('reads a six-digit hex, with or without the hash', () => {
    expect(hexToRgb('#ff8800')).toEqual({ r: 255, g: 136, b: 0 })
    expect(hexToRgb('ff8800')).toEqual({ r: 255, g: 136, b: 0 })
  })

  it('expands the three-digit shorthand', () => {
    expect(hexToRgb('#f80')).toEqual({ r: 255, g: 136, b: 0 })
  })

  it('reports anything else as unreadable rather than guessing', () => {
    expect(hexToRgb('rebeccapurple')).toBeNull()
    expect(hexToRgb('#ff88')).toBeNull()
    expect(hexToRgb('#gg8800')).toBeNull()
  })
})

describe('readableTextOn', () => {
  /** A tag's colour comes from a colour input, so a filled badge with one fixed ink is a badge that
   * becomes unreadable on the first pale colour anyone picks. */
  it('inks a dark fill white', () => {
    expect(readableTextOn('#1d4ed8')).toBe('#ffffff')
    expect(readableTextOn('#000000')).toBe('#ffffff')
  })

  it('inks a pale fill near-black', () => {
    expect(readableTextOn('#ffee00')).toBe('#171717')
    expect(readableTextOn('#ffffff')).toBe('#171717')
  })

  it('falls back to dark ink for a colour it cannot read', () => {
    expect(readableTextOn('not-a-colour')).toBe('#171717')
  })
})

describe('issueReference', () => {
  it('reads a tracked card’s reference off the link it stores', () => {
    expect(
      issueReference({ number: 8, sourceIssue: { owner: 'acme', repo: 'widgets', number: 42 } })
    ).toBe('#42')
  })

  /** A card on a remote board *is* an issue; its own number is the one GitHub allocated. */
  it('reads a remote card’s reference off its number', () => {
    expect(issueReference({ number: 42 }, 'remote')).toBe('#42')
  })

  /** Nothing on the card tells this apart from a remote one — hence the board's source. */
  it('reports nothing for an ordinary local card, however numbered', () => {
    expect(issueReference({ number: 7 }, 'local')).toBeUndefined()
    expect(issueReference({ number: 7 })).toBeUndefined()
  })

  it('reports nothing for a remote card that predates numbering', () => {
    expect(issueReference({ number: 0 }, 'remote')).toBeUndefined()
  })

  /** The tracked link wins: `#42` is the issue, whatever the local board numbered the card. */
  it('prefers the tracked link over the card’s own number', () => {
    expect(
      issueReference({ number: 8, sourceIssue: { owner: 'a', repo: 'b', number: 42 } }, 'local')
    ).toBe('#42')
  })
})
