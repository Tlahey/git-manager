import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Board } from '@git-manager/git-types'
import { makeBoard, makeCard } from '../test/boardFactories'
import { useBoardActions } from './useBoardActions'

function makeBackend() {
  return {
    listBoards: vi.fn(),
    getBoard: vi.fn(),
    createBoard: vi.fn(),
    updateBoardColumns: vi.fn(),
    updateBoardMeta: vi.fn(),
    closeBoard: vi.fn(),
    deleteBoard: vi.fn(),
    createCard: vi.fn(),
    updateCard: vi.fn(),
    addComment: vi.fn(),
    moveCard: vi.fn(),
    moveCardsToBoard: vi.fn(),
    deleteCard: vi.fn(),
    deleteCards: vi.fn(),
    setCardsArchived: vi.fn(),
    assignCardIdentifiers: vi.fn(),
  }
}

const path = '/repo'
let backend = makeBackend()

function renderActions(activeBoard: Board | null = makeBoard(), boards: Board[] = [makeBoard()]) {
  const setActiveBoard = vi.fn()
  const revalidateLists = vi.fn()
  const mutateDetail = vi.fn()
  const { result } = renderHook(() =>
    useBoardActions({
      repoPath: path,
      catalog: {
        boards,
        boardsLoading: false,
        activeBoard,
        setActiveBoard,
        revalidateLists,
      },
      detail: {
        mutateDetail: mutateDetail as never,
        // The *detail*'s revision, not the list's — see `useBoardDetail.revisionFor`.
        revisionFor: () => 'rev-detail',
        withConflictToast: (run) => run(),
      },
      backendFor: () => backend,
    })
  )
  return { result, setActiveBoard, revalidateLists, mutateDetail }
}

beforeEach(() => {
  backend = makeBackend()
})

describe('useBoardActions', () => {
  it('opens a board it just created, so the user lands on it', async () => {
    const created = makeBoard({ id: 'new' })
    backend.createBoard.mockResolvedValue(created)
    const { result, setActiveBoard } = renderActions()

    await result.current.createBoard('Sprint 13', [], 'local')
    expect(setActiveBoard).toHaveBeenCalledWith('new')
  })

  /** A card write moves a local board's ref tip, so the *list*'s revision is stale by then; the
   * detail's is the one that stays current. */
  it('writes board settings under the detail’s revision', async () => {
    backend.updateBoardMeta.mockResolvedValue(makeBoard())
    const { result } = renderActions()

    await result.current.updateBoardMeta('Renamed', [], '', ['GM'])
    expect(backend.updateBoardMeta).toHaveBeenCalledWith(
      path,
      'b1',
      'Renamed',
      [],
      '',
      ['GM'],
      'rev-detail'
    )
  })

  it('falls back to another board after deleting the open one', async () => {
    backend.deleteBoard.mockResolvedValue(undefined)
    const open = makeBoard({ id: 'b1' })
    const other = makeBoard({ id: 'b2' })
    const { result, setActiveBoard } = renderActions(open, [open, other])

    await result.current.deleteBoard(open)
    expect(setActiveBoard).toHaveBeenCalledWith('b2')
  })

  it('selects nothing when the deleted board was the only one', async () => {
    backend.deleteBoard.mockResolvedValue(undefined)
    const only = makeBoard({ id: 'b1' })
    const { result, setActiveBoard } = renderActions(only, [only])

    await result.current.deleteBoard(only)
    expect(setActiveBoard).not.toHaveBeenCalled()
  })

  /** The "keep cards" branch archives every card server-side in the same write (see
   * `git_board.rs::delete_board`'s own doc comment), but `revalidateLists` only re-reads the board
   * list — without this, reopening the tombstoned board via "Show deleted" would still read its
   * cards' pre-deletion cache and show them sitting in their old columns instead of archived. */
  it('refreshes the deleted board’s own cards, not just the board list', async () => {
    backend.deleteBoard.mockResolvedValue(undefined)
    const only = makeBoard({ id: 'b1' })
    const { result, mutateDetail } = renderActions(only, [only])

    await result.current.deleteBoard(only, false)
    expect(mutateDetail).toHaveBeenCalled()
  })

  /** The cards changed, so the open board has to be refetched — the identifiers are on them, not on
   * the board. */
  it('refreshes after numbering the cards that had no identifier', async () => {
    backend.assignCardIdentifiers.mockResolvedValue(3)
    const { result, mutateDetail, revalidateLists } = renderActions()

    await expect(result.current.assignCardIdentifiers('GM')).resolves.toBe(3)
    expect(backend.assignCardIdentifiers).toHaveBeenCalledWith(path, 'b1', 'GM')
    expect(mutateDetail).toHaveBeenCalled()
    expect(revalidateLists).toHaveBeenCalled()
  })

  it('does not refetch a board where nothing needed numbering', async () => {
    backend.assignCardIdentifiers.mockResolvedValue(0)
    const { result, mutateDetail } = renderActions()

    await result.current.assignCardIdentifiers('GM')
    expect(mutateDetail).not.toHaveBeenCalled()
  })
})

describe('useBoardActions — closeSprint', () => {
  const summary = {
    closedAt: '2026-08-05T00:00:00.000Z',
    totalCards: 3,
    doneCards: 1,
    unfinishedCards: 2,
    completionRate: 33,
    blockedCards: 0,
    overdueCards: 0,
    byColumn: [],
    byPriority: [],
    byAssignee: [],
  }

  /**
   * The successor is created and filled *before* the close, so a failure part-way leaves a sprint
   * that is still open and still owns its cards — recoverable by retrying — rather than a closed,
   * read-only sprint whose work has nowhere to go.
   */
  it('creates the successor and carries the leftovers before closing', async () => {
    const order: string[] = []
    backend.createBoard.mockImplementation(() => {
      order.push('create')
      return Promise.resolve(makeBoard({ id: 'next' }))
    })
    backend.moveCardsToBoard.mockImplementation(() => {
      order.push('carry')
      return Promise.resolve(undefined)
    })
    backend.closeBoard.mockImplementation(() => {
      order.push('close')
      return Promise.resolve(makeBoard())
    })
    const { result, setActiveBoard } = renderActions()

    await result.current.closeSprint(summary, { name: 'Sprint 13', carryOverCardIds: ['c1', 'c2'] })

    expect(order).toEqual(['create', 'carry', 'close'])
    expect(backend.closeBoard).toHaveBeenCalledWith(
      path,
      'b1',
      expect.objectContaining({ carriedOverToBoardId: 'next' }),
      'rev-detail'
    )
    // Landing on the successor is the point: the sprint just closed is read-only.
    expect(setActiveBoard).toHaveBeenCalledWith('next')
  })

  it('leaves the sprint open when the successor cannot be created', async () => {
    backend.createBoard.mockRejectedValue(new Error('disk full'))
    const { result } = renderActions()

    await expect(
      result.current.closeSprint(summary, { name: 'Sprint 13', carryOverCardIds: ['c1'] })
    ).rejects.toThrow()
    expect(backend.closeBoard).not.toHaveBeenCalled()
  })

  it('closes without a successor, and stays where it is', async () => {
    backend.closeBoard.mockResolvedValue(makeBoard())
    const { result, setActiveBoard } = renderActions()

    await result.current.closeSprint(summary, null)

    expect(backend.createBoard).not.toHaveBeenCalled()
    expect(backend.closeBoard).toHaveBeenCalledWith(
      path,
      'b1',
      expect.objectContaining({ carriedOverToBoardId: undefined }),
      'rev-detail'
    )
    expect(setActiveBoard).not.toHaveBeenCalled()
  })

  /**
   * Regression, found by `apps/e2e/features/board.feature`: carrying the leftovers out commits on
   * the board being closed as well, so the revision read before it is already behind the ref tip.
   * Closing under that one lost the compare-and-swap every time — the whole gesture ended as a
   * conflict toast, with the sprint still open and its cards already gone to the successor.
   */
  it('closes under the revision the carry-over left behind, not the one it started with', async () => {
    backend.createBoard.mockResolvedValue(makeBoard({ id: 'next' }))
    backend.moveCardsToBoard.mockResolvedValue(undefined)
    backend.closeBoard.mockResolvedValue(makeBoard())
    const { result, mutateDetail } = renderActions()
    mutateDetail.mockResolvedValue({
      board: makeBoard({ revision: 'rev-after-carry' }),
      cards: [],
    })

    await result.current.closeSprint(summary, { name: 'Sprint 13', carryOverCardIds: ['c1'] })

    expect(mutateDetail).toHaveBeenCalled()
    expect(backend.closeBoard).toHaveBeenCalledWith(
      path,
      'b1',
      expect.anything(),
      'rev-after-carry'
    )
  })

  /** Nothing left to carry: a successor is still opened, just empty. */
  it('skips the carry-over call when everything was finished', async () => {
    backend.createBoard.mockResolvedValue(makeBoard({ id: 'next' }))
    backend.closeBoard.mockResolvedValue(makeBoard())
    const { result } = renderActions()

    await result.current.closeSprint(summary, { name: 'Sprint 13', carryOverCardIds: [] })
    expect(backend.moveCardsToBoard).not.toHaveBeenCalled()
  })
})

/**
 * Three orderings matter around archiving at close, and none of them is arbitrary: after the
 * carry-over (which takes the unfinished cards away), before the close (a closed board is read-only),
 * and after the summary was computed (in the dialog, so the report counts the finished work rather
 * than an emptied column).
 */
describe('useBoardActions — closeSprint archives the finished column', () => {
  const summary = {
    closedAt: '2026-08-05T00:00:00.000Z',
    totalCards: 2,
    doneCards: 1,
    unfinishedCards: 1,
    completionRate: 50,
    blockedCards: 0,
    overdueCards: 0,
    byColumn: [],
    byPriority: [],
    byAssignee: [],
  }

  it('archives the named column between the carry-over and the close', async () => {
    const order: string[] = []
    backend.createBoard.mockImplementation(() => {
      order.push('create')
      return Promise.resolve(makeBoard({ id: 'next' }))
    })
    backend.moveCardsToBoard.mockImplementation(() => {
      order.push('carry')
      return Promise.resolve(undefined)
    })
    backend.getBoard.mockResolvedValue({
      board: makeBoard(),
      cards: [
        makeCard({ id: 'done-1', columnId: 'done' }),
        makeCard({ id: 'done-2', columnId: 'done', archivedAt: '2026-01-01T00:00:00.000Z' }),
        makeCard({ id: 'other', columnId: 'todo' }),
      ],
    })
    backend.setCardsArchived.mockImplementation(() => {
      order.push('archive')
      return Promise.resolve(1)
    })
    backend.closeBoard.mockImplementation(() => {
      order.push('close')
      return Promise.resolve(makeBoard({ closedAt: summary.closedAt }))
    })
    const { result } = renderActions()

    await result.current.closeSprint(
      summary,
      { name: 'Sprint 13', carryOverCardIds: ['other'] },
      'done'
    )

    expect(order).toEqual(['create', 'carry', 'archive', 'close'])
    // Only what is in that column and still on the board — not the already-archived one.
    expect(backend.setCardsArchived).toHaveBeenCalledWith(path, 'b1', ['done-1'], true)
  })

  it('archives nothing when the box was unticked', async () => {
    backend.closeBoard.mockResolvedValue(makeBoard())
    const { result } = renderActions()

    await result.current.closeSprint(summary, null, null)

    expect(backend.setCardsArchived).not.toHaveBeenCalled()
    expect(backend.closeBoard).toHaveBeenCalled()
  })

  it('spends no write on a column that has nothing left on the board', async () => {
    backend.getBoard.mockResolvedValue({
      board: makeBoard(),
      cards: [makeCard({ id: 'other', columnId: 'todo' })],
    })
    backend.closeBoard.mockResolvedValue(makeBoard())
    const { result } = renderActions()

    await result.current.closeSprint(summary, null, 'done')

    expect(backend.setCardsArchived).not.toHaveBeenCalled()
  })
})
