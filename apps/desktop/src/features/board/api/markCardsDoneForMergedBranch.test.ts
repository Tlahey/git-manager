import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Board, BoardCard } from '@git-manager/git-types'
import { makeBoard, makeCard } from '../test/boardFactories'

const { localBackend } = vi.hoisted(() => ({
  localBackend: {
    listBoards: vi.fn(),
    getBoard: vi.fn(),
    updateCard: vi.fn(),
  },
}))

vi.mock('./local-board.api', () => ({ localBoardBackend: localBackend }))

import { markCardsDoneForMergedBranch } from './markCardsDoneForMergedBranch'

const path = '/repo'

function boardWith(overrides: Partial<Board> = {}): Board {
  return makeBoard({
    id: 'b1',
    columns: [
      { id: 'todo', name: 'To do', order: 0 },
      { id: 'done', name: 'Done', order: 1, isDone: true },
    ],
    ...overrides,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  localBackend.updateCard.mockResolvedValue(makeCard())
})

describe('markCardsDoneForMergedBranch', () => {
  it('moves a card linked to the merged branch to the done column', async () => {
    const board = boardWith()
    localBackend.listBoards.mockResolvedValue([board])
    localBackend.getBoard.mockResolvedValue({
      board,
      cards: [makeCard({ id: 'c1', columnId: 'todo', linkedBranch: 'feature/x', revision: 'r1' })],
    })

    await markCardsDoneForMergedBranch(path, 'feature/x')

    expect(localBackend.updateCard).toHaveBeenCalledWith(
      path,
      'b1',
      'c1',
      { columnId: 'done' },
      'r1'
    )
  })

  it('leaves cards linked to a different branch untouched', async () => {
    const board = boardWith()
    localBackend.listBoards.mockResolvedValue([board])
    localBackend.getBoard.mockResolvedValue({
      board,
      cards: [makeCard({ id: 'c1', columnId: 'todo', linkedBranch: 'other-branch' })],
    })

    await markCardsDoneForMergedBranch(path, 'feature/x')

    expect(localBackend.updateCard).not.toHaveBeenCalled()
  })

  it('leaves an archived card untouched even if linked to the branch', async () => {
    const board = boardWith()
    localBackend.listBoards.mockResolvedValue([board])
    localBackend.getBoard.mockResolvedValue({
      board,
      cards: [
        makeCard({
          id: 'c1',
          columnId: 'todo',
          linkedBranch: 'feature/x',
          archivedAt: '2026-08-01T00:00:00.000Z',
        }),
      ],
    })

    await markCardsDoneForMergedBranch(path, 'feature/x')

    expect(localBackend.updateCard).not.toHaveBeenCalled()
  })

  it('does not re-move a card already in the done column', async () => {
    const board = boardWith()
    localBackend.listBoards.mockResolvedValue([board])
    localBackend.getBoard.mockResolvedValue({
      board,
      cards: [makeCard({ id: 'c1', columnId: 'done', linkedBranch: 'feature/x' })],
    })

    await markCardsDoneForMergedBranch(path, 'feature/x')

    expect(localBackend.updateCard).not.toHaveBeenCalled()
  })

  it('falls back to the last column when no column is flagged done', async () => {
    const board = boardWith({
      columns: [
        { id: 'todo', name: 'To do', order: 0 },
        { id: 'review', name: 'Review', order: 1 },
      ],
    })
    localBackend.listBoards.mockResolvedValue([board])
    localBackend.getBoard.mockResolvedValue({
      board,
      cards: [makeCard({ id: 'c1', columnId: 'todo', linkedBranch: 'feature/x', revision: 'r1' })],
    })

    await markCardsDoneForMergedBranch(path, 'feature/x')

    expect(localBackend.updateCard).toHaveBeenCalledWith(
      path,
      'b1',
      'c1',
      { columnId: 'review' },
      'r1'
    )
  })

  it('sweeps every board of the repo, not just the first', async () => {
    const b1 = boardWith({ id: 'b1' })
    const b2 = boardWith({ id: 'b2' })
    localBackend.listBoards.mockResolvedValue([b1, b2])
    localBackend.getBoard.mockImplementation((_path: string, boardId: string) =>
      Promise.resolve({
        board: boardId === 'b1' ? b1 : b2,
        cards: [
          makeCard({
            id: `c-${boardId}`,
            columnId: 'todo',
            linkedBranch: 'feature/x',
            revision: 'r1',
          }),
        ],
      })
    )

    await markCardsDoneForMergedBranch(path, 'feature/x')

    expect(localBackend.updateCard).toHaveBeenCalledTimes(2)
    expect(localBackend.updateCard).toHaveBeenCalledWith(
      path,
      'b1',
      'c-b1',
      { columnId: 'done' },
      'r1'
    )
    expect(localBackend.updateCard).toHaveBeenCalledWith(
      path,
      'b2',
      'c-b2',
      { columnId: 'done' },
      'r1'
    )
  })

  it('skips a board it cannot read rather than aborting the sweep', async () => {
    const b1 = boardWith({ id: 'b1' })
    const b2 = boardWith({ id: 'b2' })
    localBackend.listBoards.mockResolvedValue([b1, b2])
    localBackend.getBoard.mockImplementation((_path: string, boardId: string) => {
      if (boardId === 'b1') return Promise.reject(new Error('board ref missing'))
      return Promise.resolve({
        board: b2,
        cards: [
          makeCard({ id: 'c-b2', columnId: 'todo', linkedBranch: 'feature/x', revision: 'r1' }),
        ],
      })
    })

    await markCardsDoneForMergedBranch(path, 'feature/x')

    expect(localBackend.updateCard).toHaveBeenCalledWith(
      path,
      'b2',
      'c-b2',
      { columnId: 'done' },
      'r1'
    )
  })

  it('does not let a stale-revision conflict on one card stop the others', async () => {
    const board = boardWith()
    localBackend.listBoards.mockResolvedValue([board])
    localBackend.getBoard.mockResolvedValue({
      board,
      cards: [
        makeCard({ id: 'stale', columnId: 'todo', linkedBranch: 'feature/x', revision: 'old' }),
        makeCard({ id: 'fresh', columnId: 'todo', linkedBranch: 'feature/x', revision: 'r1' }),
      ],
    })
    localBackend.updateCard.mockImplementation((_p: string, _b: string, cardId: string) =>
      cardId === 'stale'
        ? Promise.reject(Object.assign(new Error('stale'), { code: 'BOARD_CONFLICT' }))
        : Promise.resolve(makeCard())
    )

    await markCardsDoneForMergedBranch(path, 'feature/x')

    expect(localBackend.updateCard).toHaveBeenCalledWith(
      path,
      'b1',
      'fresh',
      { columnId: 'done' },
      'r1'
    )
  })

  it('does nothing when no board has a card linked to the branch', async () => {
    const board = boardWith()
    localBackend.listBoards.mockResolvedValue([board])
    localBackend.getBoard.mockResolvedValue({ board, cards: [] as BoardCard[] })

    // Zero, not `undefined`: the count is what tells the caller whether anything on screen needs
    // re-reading, and "nothing moved" is an answer rather than an absence (see `BoardMergeCompletion`).
    await expect(markCardsDoneForMergedBranch(path, 'feature/x')).resolves.toBe(0)
    expect(localBackend.updateCard).not.toHaveBeenCalled()
  })

  it('counts the cards it moved, across boards', async () => {
    const first = boardWith()
    const second = { ...boardWith(), id: 'b2' }
    localBackend.listBoards.mockResolvedValue([first, second])
    localBackend.getBoard.mockImplementation((_path: string, boardId: string) =>
      Promise.resolve({
        board: boardId === 'b1' ? first : second,
        cards: [
          makeCard({ id: `${boardId}-c1`, boardId, columnId: 'todo', linkedBranch: 'feature/x' }),
        ],
      })
    )
    localBackend.updateCard.mockResolvedValue(makeCard())

    await expect(markCardsDoneForMergedBranch(path, 'feature/x')).resolves.toBe(2)
  })

  // A write that lost its race left the card where it was, so counting it would tell the caller to
  // re-read for a change that never landed — harmless, but the count is meant to mean something.
  it('does not count a card whose write failed', async () => {
    const board = boardWith()
    localBackend.listBoards.mockResolvedValue([board])
    localBackend.getBoard.mockResolvedValue({
      board,
      cards: [makeCard({ id: 'c1', columnId: 'todo', linkedBranch: 'feature/x' })],
    })
    localBackend.updateCard.mockRejectedValue(new Error('stale revision'))

    await expect(markCardsDoneForMergedBranch(path, 'feature/x')).resolves.toBe(0)
  })
})
