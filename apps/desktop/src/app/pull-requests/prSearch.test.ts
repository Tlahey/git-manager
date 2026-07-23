import { describe, it, expect } from 'vitest'
import { matchesPrSearch } from './prSearch'
import type { MockPR } from './types'

const pr = {
  title: 'Fix the login bug',
  author: 'alice',
  repo: 'web-app',
  number: 1234,
} as MockPR

describe('matchesPrSearch', () => {
  it('matches everything for an empty or whitespace query', () => {
    expect(matchesPrSearch(pr, '')).toBe(true)
    expect(matchesPrSearch(pr, '   ')).toBe(true)
  })

  it('matches on title, author, repo and number (case-insensitive)', () => {
    expect(matchesPrSearch(pr, 'LOGIN')).toBe(true)
    expect(matchesPrSearch(pr, 'alice')).toBe(true)
    expect(matchesPrSearch(pr, 'web-app')).toBe(true)
    expect(matchesPrSearch(pr, '1234')).toBe(true)
  })

  it('returns false when nothing matches', () => {
    expect(matchesPrSearch(pr, 'nonexistent')).toBe(false)
  })
})
