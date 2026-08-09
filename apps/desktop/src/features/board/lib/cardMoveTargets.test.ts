import { describe, it, expect } from 'vitest'
import type { Board } from '@git-manager/git-types'
import { makeBoard, makeCard } from '../test/boardFactories'
import { columnMoveTargetsFor, defaultColumnFor, moveTargetsFor } from './cardMoveTargets'

const columns = [
  { id: 'todo', name: 'Todo', order: 0 },
  { id: 'doing', name: 'Doing', order: 1 },
]

function board(overrides: Partial<Board> = {}): Board {
  return makeBoard({ columns, ...overrides })
}

describe('moveTargetsFor', () => {
  it('leaves out the board the card is already on', () => {
    const here = board({ id: 'b1' })
    const there = board({ id: 'b2' })
    const targets = moveTargetsFor([here, there], makeCard({ boardId: 'b1' }), 'local')
    expect(targets.map((b) => b.id)).toEqual(['b2'])
  })

  /** A closed sprint's statistics are frozen; a card arriving would make it report a total it never
   * had. */
  it('leaves out closed sprints', () => {
    const open = board({ id: 'b2' })
    const closed = board({ id: 'b3', closedAt: '2026-01-01T00:00:00Z' })
    const targets = moveTargetsFor(
      [board({ id: 'b1' }), open, closed],
      makeCard({ boardId: 'b1' }),
      'local'
    )
    expect(targets.map((b) => b.id)).toEqual(['b2'])
  })

  it('offers a local card both a local and a GitHub board', () => {
    const local = board({ id: 'b2', source: 'local' })
    const remote = board({ id: 'b3', source: 'remote' })
    const targets = moveTargetsFor(
      [board({ id: 'b1' }), local, remote],
      makeCard({ boardId: 'b1' }),
      'local'
    )
    expect(targets.map((b) => b.id)).toEqual(['b2', 'b3'])
  })

  /**
   * A tracked card already stands for an issue: taking the create path would produce a second issue
   * copying the first, leave the original open, and delete the only card that linked them.
   */
  it('offers a tracked card no GitHub board at all', () => {
    const local = board({ id: 'b2', source: 'local' })
    const remote = board({ id: 'b3', source: 'remote' })
    const tracked = makeCard({
      boardId: 'b1',
      sourceIssue: { owner: 'acme', repo: 'widgets', number: 42 },
    })
    const targets = moveTargetsFor([board({ id: 'b1' }), local, remote], tracked, 'local')
    expect(targets.map((b) => b.id)).toEqual(['b2'])
  })

  /** The local → GitHub direction creates the issue; this one would have to close one, and that is
   * not what "move to my private board" means. */
  it('offers a GitHub card only other GitHub boards', () => {
    const local = board({ id: 'b2', source: 'local' })
    const remote = board({ id: 'b3', source: 'remote' })
    const targets = moveTargetsFor(
      [board({ id: 'b1', source: 'remote' }), local, remote],
      makeCard({ boardId: 'b1' }),
      'remote'
    )
    expect(targets.map((b) => b.id)).toEqual(['b3'])
  })
})

describe('defaultColumnFor', () => {
  it('keeps the card in a column of the same id', () => {
    expect(defaultColumnFor(board(), 'doing')).toBe('doing')
  })

  it('falls back to the first column when the target has no such id', () => {
    expect(defaultColumnFor(board(), 'review')).toBe('todo')
  })

  it('reads the first column by order, not by position in the array', () => {
    const reordered = board({
      columns: [
        { id: 'doing', name: 'Doing', order: 1 },
        { id: 'todo', name: 'Todo', order: 0 },
      ],
    })
    expect(defaultColumnFor(reordered, 'review')).toBe('todo')
  })

  it('reports no column for a board that has none', () => {
    expect(defaultColumnFor(board({ columns: [] }), 'todo')).toBe('')
  })
})

/**
 * A column is a set, and the only genuinely bulk move either backend has — `moveCardsToBoard` — is
 * same-backend by construction. The local→GitHub direction a *single* card enjoys creates an issue
 * per card, which is not one operation, so it is kept out of the picker rather than half-supported.
 */
describe('columnMoveTargetsFor', () => {
  const local = makeBoard({ id: 'b1', source: 'local' })
  const otherLocal = makeBoard({ id: 'b2', source: 'local' })
  const closedLocal = makeBoard({ id: 'b3', source: 'local', closedAt: '2026-08-01T00:00:00.000Z' })
  const remote = makeBoard({ id: 'b9', source: 'remote' })

  it('offers the other open boards on the same backend', () => {
    expect(
      columnMoveTargetsFor([local, otherLocal, closedLocal, remote], local).map((b) => b.id)
    ).toEqual(['b2'])
  })

  it('never offers the board the column is on', () => {
    expect(columnMoveTargetsFor([local], local)).toEqual([])
  })

  /** A closed sprint's statistics are frozen; cards arriving would make it report a total it never had. */
  it('never offers a closed sprint', () => {
    expect(columnMoveTargetsFor([local, closedLocal], local)).toEqual([])
  })

  it('refuses the crossing a single card is allowed', () => {
    expect(columnMoveTargetsFor([local, remote], local)).toEqual([])
    expect(columnMoveTargetsFor([remote, local], remote)).toEqual([])
  })
})
