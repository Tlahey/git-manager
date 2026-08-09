import { describe, it, expect } from 'vitest'
import type { BoardCard } from '@git-manager/git-types'
import { makeCard } from '../test/boardFactories'
import { INVERSE_OF, linkWrite, parentOf, resolveCardLinks, unlinkWrite } from './cardLinks'

function card(id: string, overrides: Partial<BoardCard> = {}): BoardCard {
  return makeCard({ id, boardId: 'b1', title: id, ...overrides })
}

describe('resolveCardLinks — forward halves', () => {
  it('reads back what the card itself declares', () => {
    const epic = card('epic', {
      links: [{ targetBoardId: 'b1', targetCardId: 'c2', kind: 'contains' }],
    })
    const child = card('c2')

    const links = resolveCardLinks(epic, [epic, child])
    expect(links).toHaveLength(1)
    expect(links[0].kind).toBe('contains')
    expect(links[0].card?.id).toBe('c2')
    expect(links[0].owner.id).toBe('epic')
  })

  /** The link is real even though the card at the other end isn't loaded — the UI shows the board's
   * name rather than dropping the row. */
  it('keeps a link whose target sits on another board, unresolved', () => {
    const c1 = card('c1', {
      links: [{ targetBoardId: 'b2', targetCardId: 'far', kind: 'relates' }],
    })

    const links = resolveCardLinks(c1, [c1])
    expect(links).toHaveLength(1)
    expect(links[0].card).toBeUndefined()
    expect(links[0].targetBoardId).toBe('b2')
  })
})

describe('resolveCardLinks — inverse halves', () => {
  it('derives "blocked by" from the blocker, without it being stored', () => {
    const blocker = card('c1', {
      links: [{ targetBoardId: 'b1', targetCardId: 'c2', kind: 'blocks' }],
    })
    const blocked = card('c2')

    const links = resolveCardLinks(blocked, [blocker, blocked])
    expect(links).toHaveLength(1)
    expect(links[0].kind).toBe('blockedBy')
    expect(links[0].card?.id).toBe('c1')
    // Removing it writes on the blocker, which is where the half lives.
    expect(links[0].owner.id).toBe('c1')
    expect(blocked.links).toEqual([])
  })

  it('derives "part of" from the epic', () => {
    const epic = card('epic', {
      links: [{ targetBoardId: 'b1', targetCardId: 'c2', kind: 'contains' }],
    })
    const child = card('c2')

    const links = resolveCardLinks(child, [epic, child])
    expect(links[0].kind).toBe('partOf')
    expect(links[0].card?.id).toBe('epic')
  })

  it('reads a mutual "relates" as one row, still removable from here', () => {
    const c1 = card('c1', {
      links: [{ targetBoardId: 'b1', targetCardId: 'c2', kind: 'relates' }],
    })
    const c2 = card('c2', {
      links: [{ targetBoardId: 'b1', targetCardId: 'c1', kind: 'relates' }],
    })

    const links = resolveCardLinks(c1, [c1, c2])
    expect(links).toHaveLength(1)
    expect(links[0].owner.id).toBe('c1')
  })

  /** A remote card's id is its bare issue number, so the same number names different cards on
   * different boards — collapsing them hid one link behind the other. */
  it('keeps two links that share a card id but not a board', () => {
    const subject = card('c1', {
      links: [
        { targetBoardId: 'b1', targetCardId: '12', kind: 'relates' },
        { targetBoardId: 'b2', targetCardId: '12', kind: 'relates' },
      ],
    })

    const links = resolveCardLinks(subject, [subject])
    expect(links).toHaveLength(2)
    expect(links.map((l) => l.targetBoardId)).toEqual(['b1', 'b2'])
  })

  it('orders containment before blocking before the loosest relation', () => {
    const subject = card('c1', {
      links: [
        { targetBoardId: 'b1', targetCardId: 'c2', kind: 'relates' },
        { targetBoardId: 'b1', targetCardId: 'c3', kind: 'blocks' },
        { targetBoardId: 'b1', targetCardId: 'c4', kind: 'contains' },
      ],
    })

    const kinds = resolveCardLinks(subject, [subject]).map((l) => l.kind)
    expect(kinds).toEqual(['contains', 'blocks', 'relates'])
  })

  it('has "relates" as its own inverse', () => {
    expect(INVERSE_OF.relates).toBe('relates')
  })
})

describe('linkWrite', () => {
  it('stores a forward relation on the card it was picked from', () => {
    const from = card('c1')
    const target = card('c2')

    expect(linkWrite(from, target, 'blocks')).toEqual({
      card: from,
      links: [{ targetBoardId: 'b1', targetCardId: 'c2', kind: 'blocks' }],
    })
  })

  /** "Blocked by X" is not a half of its own: it is `blocks` written on X. */
  it('writes an inverse relation on the other card, as its forward half', () => {
    const from = card('c1')
    const target = card('c2')

    expect(linkWrite(from, target, 'blockedBy')).toEqual({
      card: target,
      links: [{ targetBoardId: 'b1', targetCardId: 'c1', kind: 'blocks' }],
    })
  })

  it('turns "part of" into "contains" on the epic', () => {
    const from = card('c1')
    const epic = card('epic')

    expect(linkWrite(from, epic, 'partOf')).toEqual({
      card: epic,
      links: [{ targetBoardId: 'b1', targetCardId: 'c1', kind: 'contains' }],
    })
  })

  it('keeps the links already there', () => {
    const existing = { targetBoardId: 'b1', targetCardId: 'c9', kind: 'relates' as const }
    const from = card('c1', { links: [existing] })

    expect(linkWrite(from, card('c2'), 'blocks')?.links).toEqual([
      existing,
      { targetBoardId: 'b1', targetCardId: 'c2', kind: 'blocks' },
    ])
  })

  it('refuses a card linked to itself', () => {
    const from = card('c1')
    expect(linkWrite(from, from, 'relates')).toBeNull()
  })

  it('refuses a relation that already exists, rather than writing a duplicate', () => {
    const from = card('c1', {
      links: [{ targetBoardId: 'b1', targetCardId: 'c2', kind: 'blocks' }],
    })
    expect(linkWrite(from, card('c2'), 'blocks')).toBeNull()
  })
})

describe('unlinkWrite', () => {
  it('returns the owner’s remaining links, the whole list', () => {
    const kept = { targetBoardId: 'b1', targetCardId: 'c9', kind: 'relates' as const }
    const removed = { targetBoardId: 'b1', targetCardId: 'c2', kind: 'blocks' as const }
    const owner = card('c1', { links: [kept, removed] })

    const link = resolveCardLinks(owner, [owner]).find((l) => l.kind === 'blocks')!
    expect(unlinkWrite(link)).toEqual([kept])
  })

  it('removes an inverse relation from the card that stores it', () => {
    const blocker = card('c1', {
      links: [{ targetBoardId: 'b1', targetCardId: 'c2', kind: 'blocks' }],
    })
    const blocked = card('c2')

    const link = resolveCardLinks(blocked, [blocker, blocked])[0]
    expect(link.owner.id).toBe('c1')
    expect(unlinkWrite(link)).toEqual([])
  })
})

describe('parentOf', () => {
  it('finds the epic that declared it contains this card', () => {
    const epic = card('epic', {
      kind: 'epic',
      links: [{ targetBoardId: 'b1', targetCardId: 'c2', kind: 'contains' }],
    })
    const child = card('c2')

    expect(parentOf(child, [epic, child])?.card?.id).toBe('epic')
  })

  it('reports no parent for a card nothing contains', () => {
    const c1 = card('c1')
    expect(parentOf(c1, [c1])).toBeUndefined()
  })

  /** A `blocks` relation is not a parent, however loudly it points at the card. */
  it('ignores relations that are not containment', () => {
    const blocker = card('c1', {
      links: [{ targetBoardId: 'b1', targetCardId: 'c2', kind: 'blocks' }],
    })
    const blocked = card('c2')

    expect(parentOf(blocked, [blocker, blocked])).toBeUndefined()
  })

  /** The model permits two, a breadcrumb names one — and the relations section still lists both. */
  it('names the first when two epics both claim the card', () => {
    const a = card('epic-a', {
      links: [{ targetBoardId: 'b1', targetCardId: 'c2', kind: 'contains' }],
    })
    const b = card('epic-b', {
      links: [{ targetBoardId: 'b1', targetCardId: 'c2', kind: 'contains' }],
    })
    const child = card('c2')

    expect(parentOf(child, [a, b, child])?.card?.id).toBe('epic-a')
  })
})
