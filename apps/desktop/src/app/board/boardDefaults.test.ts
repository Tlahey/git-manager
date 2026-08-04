import { describe, it, expect } from 'vitest'
import {
  defaultColumns,
  branchNameForCard,
  nextSprintName,
  nextTagColor,
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
