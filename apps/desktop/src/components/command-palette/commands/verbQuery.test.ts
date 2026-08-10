import { describe, it, expect } from 'vitest'
import { parseVerbQuery, matchesVerb } from './verbQuery'

describe('parseVerbQuery', () => {
  it('splits a verb from its argument', () => {
    expect(parseVerbQuery('checkout ada')).toEqual({ head: 'checkout', rest: 'ada' })
  })

  it('lowercases the verb but leaves the argument alone — a branch name is case-sensitive', () => {
    expect(parseVerbQuery('CheckOut ADA-boost')).toEqual({ head: 'checkout', rest: 'ADA-boost' })
  })

  it('keeps everything after the first space as the argument', () => {
    expect(parseVerbQuery('checkout feat/two words')).toEqual({
      head: 'checkout',
      rest: 'feat/two words',
    })
  })

  it('tolerates surrounding and repeated whitespace', () => {
    expect(parseVerbQuery('  checkout   ada  ')).toEqual({ head: 'checkout', rest: 'ada' })
  })

  // No argument yet: the verb's own row is the answer, and listing its branches here would put the
  // whole list back on screen — the thing the two-step flow exists to avoid.
  it.each([['checkout'], ['checkout '], [''], ['   ']])('returns null for %j', (query) => {
    expect(parseVerbQuery(query)).toBeNull()
  })
})

describe('matchesVerb', () => {
  it('matches a whole word', () => {
    expect(matchesVerb('checkout', ['checkout', 'switch'])).toBe(true)
    expect(matchesVerb('switch', ['checkout', 'switch'])).toBe(true)
  })

  it('matches an abbreviation of three characters or more', () => {
    expect(matchesVerb('reb', ['rebase'])).toBe(true)
    expect(matchesVerb('rebas', ['rebase'])).toBe(true)
  })

  // Otherwise `re` would mean rebase *and* rename, and two branch lists would open at once.
  it('rejects an abbreviation shorter than three characters', () => {
    expect(matchesVerb('re', ['rebase'])).toBe(false)
    expect(matchesVerb('r', ['rebase'])).toBe(false)
  })

  // …unless the word itself is that short: `ff` is whole, not an abbreviation.
  it('still matches a whole word shorter than the minimum', () => {
    expect(matchesVerb('ff', ['fast-forward', 'ff'])).toBe(true)
  })

  it('does not match an unrelated head', () => {
    expect(matchesVerb('merge', ['rebase'])).toBe(false)
    expect(matchesVerb('', ['rebase'])).toBe(false)
  })

  // Ambiguity is answered by showing both verbs rather than guessing between them.
  it('matches both members of an overlapping pair', () => {
    expect(matchesVerb('delete', ['delete'])).toBe(true)
    expect(matchesVerb('delete', ['delete-remote'])).toBe(true)
  })
})
