import { describe, it, expect } from 'vitest'
import {
  defaultCardPrefix,
  defaultColumns,
  branchNameForCard,
  nextSprintName,
  nextTagColor,
  offeredCardPrefixes,
  tagIdFromName,
} from './boardDefaults'

describe('defaultColumns', () => {
  it('returns three starter columns in order', () => {
    const columns = defaultColumns()
    expect(columns.map((c) => c.id)).toEqual(['todo', 'in-progress', 'done'])
    expect(columns.map((c) => c.order)).toEqual([0, 1, 2])
  })

  it('returns a fresh array each call', () => {
    expect(defaultColumns()).not.toBe(defaultColumns())
  })
})

describe('branchNameForCard', () => {
  it('slugifies the title under a card/ prefix', () => {
    expect(branchNameForCard('Fix the header')).toBe('card/fix-the-header')
  })

  it('collapses punctuation and trims leading/trailing dashes', () => {
    expect(branchNameForCard('  Fix: the "header"!!  ')).toBe('card/fix-the-header')
  })

  it('falls back to "untitled" for a title with no slug-able characters', () => {
    expect(branchNameForCard('!!!')).toBe('card/untitled')
  })
})

describe('defaultColumns — the column that counts as done', () => {
  it('marks the last column, so a new board can already report a sprint', () => {
    expect(defaultColumns().filter((c) => c.isDone).map((c) => c.id)).toEqual(['done'])
  })
})

describe('nextTagColor', () => {
  it('hands a different colour to each of the first few tags', () => {
    expect(new Set([0, 1, 2, 3].map(nextTagColor)).size).toBe(4)
  })

  it('cycles once the palette is exhausted rather than running out', () => {
    expect(nextTagColor(6)).toBe(nextTagColor(0))
  })

  it('returns hex, which is what a GitHub label colour has to be', () => {
    expect(nextTagColor(0)).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('tagIdFromName', () => {
  it('slugifies the name', () => {
    expect(tagIdFromName('Front End!')).toBe('front-end')
  })

  it('falls back to a generated id when nothing slug-able is left', () => {
    expect(tagIdFromName('!!!')).toMatch(/^tag-/)
  })
})

describe('defaultCardPrefix', () => {
  it('takes the initials of a multi-word name', () => {
    expect(defaultCardPrefix('Mobile App')).toBe('MA')
  })

  it('takes the first three letters of a single word', () => {
    expect(defaultCardPrefix('Backlog')).toBe('BAC')
  })

  /** Two sprints of one cycle are one ticket sequence: `SPR-1` then `SPR-8`, not `S1-1` and `S2-1`. */
  it('ignores a trailing sprint number, so successive sprints share a prefix', () => {
    expect(defaultCardPrefix('Sprint 12')).toBe(defaultCardPrefix('Sprint 13'))
    expect(defaultCardPrefix('Sprint 12')).toBe('SPR')
  })

  it('caps the length so the prefix stays shorter than the number beside it', () => {
    expect(defaultCardPrefix('Really Very Long Board Name Indeed')).toBe('RVLB')
  })

  it('falls back rather than returning nothing for a name with no letters', () => {
    expect(defaultCardPrefix('🎉')).toBe('GM')
    expect(defaultCardPrefix('  ')).toBe('GM')
  })
})

describe('offeredCardPrefixes', () => {
  it('offers the board’s own prefixes when it has some', () => {
    expect(offeredCardPrefixes({ name: 'Backlog', cardPrefixes: ['GM', 'OPS'] })).toEqual([
      'GM',
      'OPS',
    ])
  })

  /** A board created before it offered a prefix would otherwise keep making cards with no identifier
   * at all — the default is what stops that from being permanent. */
  it('falls back to the name’s default when the board offers none', () => {
    expect(offeredCardPrefixes({ name: 'Backlog', cardPrefixes: [] })).toEqual(['BAC'])
  })
})

describe('nextSprintName', () => {
  it('bumps a trailing number', () => {
    expect(nextSprintName('Sprint 12')).toBe('Sprint 13')
  })

  it('keeps zero padding', () => {
    expect(nextSprintName('Sprint 09')).toBe('Sprint 10')
  })

  it('bumps a number that is not at the very end', () => {
    expect(nextSprintName('Sprint 3 (mobile)')).toBe('Sprint 4 (mobile)')
  })

  it('appends a number when there is none to bump', () => {
    expect(nextSprintName('Backlog')).toBe('Backlog 2')
  })
})
