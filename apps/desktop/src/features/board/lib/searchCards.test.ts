import { describe, it, expect } from 'vitest'
import { makeBoard, makeCard } from '../test/boardFactories'
import { matchLinkCandidates, scoreCard, searchCards, MAX_CARD_RESULTS } from './searchCards'

const sprint = makeBoard({ id: 'b1', name: 'Sprint 12' })
const backlog = makeBoard({ id: 'b2', name: 'Backlog' })

const on = (board: typeof sprint, card: Parameters<typeof makeCard>[0] = {}) => ({
  board,
  card: makeCard(card),
})

describe('scoreCard — what is matched', () => {
  it('matches the identifier, the title, the assignee and the board name', () => {
    const entry = on(sprint, { prefix: 'GM', number: 7, title: 'Fix login', assignee: 'sam' })
    expect(scoreCard(entry, 'gm-7')).not.toBeNull()
    expect(scoreCard(entry, 'login')).not.toBeNull()
    expect(scoreCard(entry, 'sam')).not.toBeNull()
    expect(scoreCard(entry, 'sprint')).not.toBeNull()
  })

  /**
   * Never the description. A row whose every visible word misses the query is one the user cannot
   * judge — the same trap the file tree fell into when a folder match kept files with nothing of the
   * query in their own name.
   */
  it('does not match the description, which the result row does not show', () => {
    const entry = on(sprint, { title: 'Fix login', description: 'the oauth callback 500s' })
    expect(scoreCard(entry, 'oauth')).toBeNull()
  })

  it('matches case-insensitively', () => {
    expect(scoreCard(on(sprint, { title: 'Fix Login' }), 'login')).not.toBeNull()
  })

  /** `cardIdentifier` returns nothing for a card that predates its board's identifiers — it has no
   * identifier to match on, rather than a `-0` nobody has seen on screen. */
  it('leaves a card with no identifier matchable by its other fields', () => {
    const entry = on(sprint, { prefix: '', number: 0, title: 'Fix login' })
    expect(scoreCard(entry, '0')).toBeNull()
    expect(scoreCard(entry, 'login')).not.toBeNull()
  })
})

describe('scoreCard — ranking', () => {
  const entry = on(sprint, { prefix: 'GM', number: 7, title: 'Fix login', assignee: 'sam' })

  /** Someone typing an identifier knows which ticket they want; a title match above it is noise. */
  it('puts an exact identifier first, ahead of every other kind of match', () => {
    const byIdentifier = scoreCard(entry, 'gm-7')!
    const byTitlePrefix = scoreCard(on(sprint, { title: 'gm-7 is broken' }), 'gm-7')!
    expect(byIdentifier).toBeLessThan(byTitlePrefix)
  })

  it('prefers a title that starts with the query to one that merely contains it', () => {
    const starts = scoreCard(on(sprint, { title: 'login page' }), 'login')!
    const contains = scoreCard(on(sprint, { title: 'fix the login page' }), 'login')!
    expect(starts).toBeLessThan(contains)
  })

  /** A query matching an assignee or a board matches many cards at once, so it sorts last. */
  it('ranks the broad sweeps below the ones naming the card itself', () => {
    const byTitle = scoreCard(entry, 'login')!
    const byAssignee = scoreCard(entry, 'sam')!
    const byBoard = scoreCard(entry, 'sprint')!
    expect(byTitle).toBeLessThan(byAssignee)
    expect(byAssignee).toBeLessThan(byBoard)
  })

  it('breaks a tie on the shorter title, which is the more precise match', () => {
    const short = scoreCard(on(sprint, { title: 'login' }), 'login')!
    const long = scoreCard(on(sprint, { title: 'login and logout and everything else' }), 'login')!
    expect(short).toBeLessThan(long)
  })
})

describe('searchCards', () => {
  it('returns nothing for a blank query rather than every ticket there is', () => {
    expect(searchCards([on(sprint), on(backlog)], '')).toEqual([])
    expect(searchCards([on(sprint)], '   ')).toEqual([])
  })

  it('looks across every board it was given', () => {
    const results = searchCards(
      [on(sprint, { id: 'c1', title: 'Fix login' }), on(backlog, { id: 'c2', title: 'Login page' })],
      'login'
    )
    expect(results.map((r) => r.board.name)).toEqual(['Backlog', 'Sprint 12'])
  })

  /**
   * The point of archiving over deleting is that the card is still there. A search that hid it would
   * make the archive a hole rather than a drawer — and "not found" would be a lie.
   */
  it('finds an archived card', () => {
    const results = searchCards(
      [on(sprint, { title: 'Fix login', archivedAt: '2026-08-04T00:00:00.000Z' })],
      'login'
    )
    expect(results).toHaveLength(1)
  })

  it('caps the list, so a two-letter query cannot render a thousand rows', () => {
    const many = Array.from({ length: MAX_CARD_RESULTS + 20 }, (_, i) =>
      on(sprint, { id: `c${i}`, title: `login ${i}` })
    )
    expect(searchCards(many, 'login')).toHaveLength(MAX_CARD_RESULTS)
  })

  it('leaves the input untouched', () => {
    const cards = [on(sprint, { title: 'Fix login' })]
    searchCards(cards, 'login')
    expect(cards[0].card.title).toBe('Fix login')
  })
})

describe('matchLinkCandidates', () => {
  const card = (id: string, overrides: Parameters<typeof makeCard>[0] = {}) =>
    makeCard({ id, title: id, ...overrides })

  /**
   * The opposite of `searchCards`, and deliberately so: this list hangs under a field the user opened
   * to choose one card out of this board, so showing what there is to choose from *is* the answer.
   */
  it('offers every candidate for a blank query', () => {
    const all = [card('c1'), card('c2')]
    expect(matchLinkCandidates(all, '')).toEqual(all)
    expect(matchLinkCandidates(all, '  ')).toEqual(all)
  })

  it('narrows by title and by identifier alike', () => {
    const byTitle = card('c1', { title: 'Ship the release' })
    const byIdentifier = card('c2', { prefix: 'GM', number: 7, title: 'Unrelated' })
    const candidates = [byTitle, byIdentifier]

    expect(matchLinkCandidates(candidates, 'ship')).toEqual([byTitle])
    expect(matchLinkCandidates(candidates, 'gm-7')).toEqual([byIdentifier])
  })

  /** Same ranking as the palette's, so `GM-7` means the same thing wherever it is typed. */
  it('puts the card the query names ahead of one that merely mentions it', () => {
    const named = card('c1', { prefix: 'GM', number: 7, title: 'Fix login' })
    const mentioning = card('c2', { prefix: 'GM', number: 9, title: 'GM-7 broke the build' })

    expect(matchLinkCandidates([mentioning, named], 'gm-7')).toEqual([named, mentioning])
  })

  /** Neither is typed here: every candidate is on one board, so both match all or none of them. */
  it('ignores the assignee and the board, which say nothing between cards of one board', () => {
    const assigned = card('c1', { title: 'Unrelated', assignee: 'sam' })
    expect(matchLinkCandidates([assigned], 'sam')).toEqual([])
  })

  it('caps the list the way every other card search does', () => {
    const many = Array.from({ length: MAX_CARD_RESULTS + 20 }, (_, i) =>
      card(`c${i}`, { title: `login ${i}` })
    )
    expect(matchLinkCandidates(many, 'login')).toHaveLength(MAX_CARD_RESULTS)
    expect(matchLinkCandidates(many, '')).toHaveLength(MAX_CARD_RESULTS)
  })
})
