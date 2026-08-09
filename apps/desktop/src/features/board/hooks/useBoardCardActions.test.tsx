import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Board, BoardCard } from '@git-manager/git-types'
import { makeBoard, makeCard } from '../test/boardFactories'

const { localBackend, remoteBackend, pushCardToIssue, createIssueComment, toastError } = vi.hoisted(
  () => {
    const make = () => ({
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
    })
    return {
      localBackend: make(),
      remoteBackend: make(),
      pushCardToIssue: vi.fn(),
      createIssueComment: vi.fn(),
      toastError: vi.fn(),
    }
  }
)

/** A `BOARD_CONFLICT` as the backends raise it — see `api/boardConflict.ts`. */
function conflict() {
  return Object.assign(new Error('stale'), { code: 'BOARD_CONFLICT' })
}

vi.mock('../api/local-board.api', () => ({ localBoardBackend: localBackend }))
vi.mock('@git-manager/ui', async () => {
  const actual = await vi.importActual<typeof import('@git-manager/ui')>('@git-manager/ui')
  return { ...actual, toast: { error: toastError, success: vi.fn() } }
})
vi.mock('../api/trackedIssue.api', () => ({ pushCardToIssue }))
vi.mock('../../../api/github.api', () => ({ createIssueComment }))

import { useBoardCardActions } from './useBoardCardActions'

const path = '/repo'
const local = makeBoard({ id: 'b1', source: 'local' })
const remote = makeBoard({ id: 'b9', source: 'remote' })

function renderActions(
  activeBoard: Board | null = local,
  boards: Board[] = [local, remote],
  trackedRef: (card: BoardCard) => null | { owner: string; repo: string; number: number } = () =>
    null,
  /** What the cached detail holds — only the purge reads it, everything else is handed its card. */
  cards: BoardCard[] = []
) {
  // SWR's `mutate(fn, opts)`: the writer runs and its rejection reaches the caller, which is the
  // whole contract `moveCard` leans on for its rollback.
  const mutateDetail = vi.fn(async (writer?: unknown, _options?: unknown) =>
    typeof writer === 'function' ? await (writer as () => Promise<unknown>)() : undefined
  )
  const revalidateAllDetails = vi.fn()
  const { result } = renderHook(() =>
    useBoardCardActions({
      repoPath: path,
      activeBoard,
      boards,
      detail: {
        boardDetail: activeBoard ? { board: activeBoard, cards } : undefined,
        cardsLoading: false,
        mutateDetail: mutateDetail as never,
        revalidateAllDetails,
        revisionFor: (b) => b.revision,
        withConflictToast: (run) => run(),
      },
      backendFor: (source) => (source === 'local' ? localBackend : remoteBackend),
      remoteBackend: remoteBackend,
      revalidateLists: vi.fn(),
      trackedRef,
      token: 'tok',
    })
  )
  return { result, mutateDetail, revalidateAllDetails }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useBoardCardActions — moveCardToBoard', () => {
  it('hands a same-backend move to the backend, with the target column', async () => {
    localBackend.moveCardsToBoard.mockResolvedValue(undefined)
    const { result } = renderActions(local, [local, makeBoard({ id: 'b2', source: 'local' })])

    await result.current.moveCardToBoard(makeCard({ boardId: 'b1' }), 'b2', 'done')

    expect(localBackend.moveCardsToBoard).toHaveBeenCalledWith(path, 'b1', 'b2', ['c1'], 'done')
    expect(remoteBackend.createCard).not.toHaveBeenCalled()
  })

  /**
   * A tracked card already stands for an issue. Taking the create path would produce a second issue
   * copying the first, leave the original open, and delete the only card that linked them — so it is
   * refused here as well as hidden from the picker, since the picker isn't the only way in.
   */
  it('refuses to move a tracked card onto a GitHub board', async () => {
    const tracked = makeCard({
      boardId: 'b1',
      sourceIssue: { owner: 'acme', repo: 'widgets', number: 42 },
    })
    const { result } = renderActions()

    await expect(result.current.moveCardToBoard(tracked, 'b9', 'todo')).rejects.toThrow()
    expect(remoteBackend.createCard).not.toHaveBeenCalled()
    expect(localBackend.deleteCard).not.toHaveBeenCalled()
  })

  it('creates the issue, carries the rest of the card, then drops the local one', async () => {
    remoteBackend.createCard.mockResolvedValue(makeCard({ id: 'gh-9', revision: 'r-gh' }))
    remoteBackend.updateCard.mockResolvedValue(makeCard({ id: 'gh-9' }))
    localBackend.deleteCard.mockResolvedValue(undefined)
    const { result } = renderActions()

    await result.current.moveCardToBoard(
      makeCard({ boardId: 'b1', priority: 'high', dueDate: '2030-01-01' }),
      'b9',
      'todo'
    )

    expect(remoteBackend.updateCard).toHaveBeenCalledWith(
      path,
      'b9',
      'gh-9',
      expect.objectContaining({ priority: 'high', dueDate: '2030-01-01' }),
      'r-gh'
    )
    expect(localBackend.deleteCard).toHaveBeenCalledWith(path, 'b1', 'c1')
  })

  /** Deleting last is what makes a failure recoverable: the card is still where it was. */
  it('leaves the local card in place when the remote write fails', async () => {
    remoteBackend.createCard.mockRejectedValue(new Error('offline'))
    const { result } = renderActions()

    await expect(
      result.current.moveCardToBoard(makeCard({ boardId: 'b1' }), 'b9', 'todo')
    ).rejects.toThrow()
    expect(localBackend.deleteCard).not.toHaveBeenCalled()
  })

  it('refuses a board that no longer exists', async () => {
    const { result } = renderActions()
    await expect(result.current.moveCardToBoard(makeCard(), 'gone', 'todo')).rejects.toThrow()
  })

  /**
   * The destination board's cards are cached under its own SWR key, which `mutateDetail` — bound to
   * the board on screen — cannot reach. Without dropping it, switching to the board the card was
   * just moved to showed it *without* the card, and went on doing so: nothing else asks for that
   * key again. Found in e2e (`board-cards.feature`), where the destination still rendered three
   * empty columns 30 seconds after the move.
   */
  it("drops every board's cached cards, not just the one on screen", async () => {
    localBackend.moveCardsToBoard.mockResolvedValue(undefined)
    const { result, revalidateAllDetails } = renderActions(local, [
      local,
      makeBoard({ id: 'b2', source: 'local' }),
    ])

    await result.current.moveCardToBoard(makeCard({ boardId: 'b1' }), 'b2', 'done')

    expect(revalidateAllDetails).toHaveBeenCalled()
  })
})

describe('useBoardCardActions — tracked cards', () => {
  const ref = { owner: 'acme', repo: 'widgets', number: 42 }

  /**
   * The issue is written **before** the local store: the card is a cache of the issue, so a failed
   * GitHub call must leave both sides untouched rather than a card showing an edit its issue never
   * received.
   */
  it('writes the issue before the local card', async () => {
    const order: string[] = []
    pushCardToIssue.mockImplementation(() => {
      order.push('issue')
      return Promise.resolve()
    })
    localBackend.updateCard.mockImplementation(() => {
      order.push('local')
      return Promise.resolve(makeCard())
    })
    const { result } = renderActions(local, [local], () => ref)

    await result.current.updateCard(makeCard(), { title: 'Renamed' })
    expect(order).toEqual(['issue', 'local'])
  })

  it('does not touch the local store when the issue write fails', async () => {
    pushCardToIssue.mockRejectedValue(new Error('offline'))
    const { result } = renderActions(local, [local], () => ref)

    await expect(result.current.updateCard(makeCard(), { title: 'Renamed' })).rejects.toThrow()
    expect(localBackend.updateCard).not.toHaveBeenCalled()
  })

  /** A patch GitHub owns nothing of — the placement — needs no issue round trip. */
  it('skips the issue entirely for a local-only field', async () => {
    localBackend.updateCard.mockResolvedValue(makeCard())
    const { result } = renderActions(local, [local], () => ref)

    await result.current.updateCard(makeCard(), { columnId: 'done' })
    expect(pushCardToIssue).not.toHaveBeenCalled()
    expect(localBackend.updateCard).toHaveBeenCalled()
  })

  /** A tracked card's discussion belongs to its issue, or the two threads quietly diverge. */
  it('posts a comment to the issue rather than the local card', async () => {
    createIssueComment.mockResolvedValue(undefined)
    const { result } = renderActions(local, [local], () => ref)

    await result.current.addComment(makeCard(), 'Looks good')
    expect(createIssueComment).toHaveBeenCalledWith('acme', 'widgets', 42, 'Looks good', 'tok')
    expect(localBackend.addComment).not.toHaveBeenCalled()
  })
})

describe('useBoardCardActions — duplicateCard', () => {
  /**
   * A copy is the same kind of work under the same sequence, but a *new* ticket — and its comments
   * stay behind, since a discussion happened on one card and reproducing it would attribute words to
   * a conversation that never took place.
   */
  it('copies what the card is, not what was said about it', async () => {
    localBackend.createCard.mockResolvedValue(makeCard({ id: 'c2', revision: 'r2' }))
    localBackend.updateCard.mockResolvedValue(makeCard({ id: 'c2' }))
    const { result } = renderActions()

    await result.current.duplicateCard(
      makeCard({
        kind: 'bug',
        prefix: 'GM',
        priority: 'high',
        linkedBranch: 'feature/x',
        comments: [{ id: 'k1', author: 'Ada', body: 'Hi', createdAt: '2026-08-01T00:00:00.000Z' }],
      })
    )

    expect(localBackend.createCard).toHaveBeenCalledWith(
      path,
      'b1',
      'todo',
      expect.objectContaining({ kind: 'bug', prefix: 'GM' })
    )
    const patch = localBackend.updateCard.mock.calls[0][3]
    expect(patch.priority).toBe('high')
    expect(patch).not.toHaveProperty('comments')
    expect(patch).not.toHaveProperty('linkedBranch')
  })
})

describe('useBoardCardActions — no active board', () => {
  it('does nothing rather than writing to a board that isn’t there', async () => {
    const { result } = renderActions(null, [])

    await expect(result.current.createCard('todo', 'T', '')).resolves.toBeUndefined()
    await expect(result.current.updateCard(makeCard(), { title: 'x' })).resolves.toBeNull()
    expect(localBackend.createCard).not.toHaveBeenCalled()
  })
})

describe('useBoardCardActions — createCard', () => {
  /** Both chosen at creation: the sequence the number comes from, and what sort of work it is. */
  it('carries the prefix and the kind to the backend', async () => {
    localBackend.createCard.mockResolvedValue(makeCard())
    const { result } = renderActions()

    await result.current.createCard('done', 'Crash on open', 'It overlaps', 'OPS', 'bug')
    expect(localBackend.createCard).toHaveBeenCalledWith(path, 'b1', 'done', {
      title: 'Crash on open',
      description: 'It overlaps',
      prefix: 'OPS',
      kind: 'bug',
    })
  })

  it('defaults to a task with no identifier', async () => {
    localBackend.createCard.mockResolvedValue(makeCard())
    const { result } = renderActions()

    await result.current.createCard('todo', 'Something', '')
    expect(localBackend.createCard).toHaveBeenCalledWith(
      path,
      'b1',
      'todo',
      expect.objectContaining({ prefix: '', kind: 'task' })
    )
  })

  /**
   * The board itself moves on a create — the identifier counter advances, and a prefix used for the
   * first time joins the board's list — so the *list* is stale too, not just the cards. That list is
   * where the next create dialog reads its prefixes from.
   */
  it('refreshes the board list, not just the cards', async () => {
    localBackend.createCard.mockResolvedValue(makeCard())
    const revalidateLists = vi.fn()
    const { result } = renderHook(() =>
      useBoardCardActions({
        repoPath: path,
        activeBoard: local,
        boards: [local],
        detail: {
          boardDetail: { board: local, cards: [] },
          cardsLoading: false,
          mutateDetail: vi.fn() as never,
          revalidateAllDetails: vi.fn(),
          revisionFor: (b) => b.revision,
          withConflictToast: (run) => run(),
        },
        backendFor: () => localBackend,
        remoteBackend: remoteBackend,
        revalidateLists,
        trackedRef: () => null,
        token: 'tok',
      })
    )

    await result.current.createCard('todo', 'Something', '')
    expect(revalidateLists).toHaveBeenCalled()
  })
})

describe('useBoardCardActions — moveCard (the optimistic one)', () => {
  /**
   * The one mutation that cannot be await-then-revalidate: a drag ends by dropping the card where the
   * data says it belongs, so waiting for the round trip makes it snap back and then jump.
   */
  it('applies the reposition to the cache before the write lands', async () => {
    localBackend.moveCard.mockResolvedValue(makeCard())
    localBackend.getBoard.mockResolvedValue({ board: local, cards: [] })
    const { result, mutateDetail } = renderActions()

    await result.current.moveCard(makeCard({ order: 0 }), 'done', 2)

    const options = mutateDetail.mock.calls[0][1] as {
      optimisticData: (c: unknown) => { cards: { columnId: string; order: number }[] }
      rollbackOnError: boolean
    }
    expect(options.rollbackOnError).toBe(true)
    const optimistic = options.optimisticData({ board: local, cards: [makeCard()] })
    expect(optimistic.cards[0]).toMatchObject({ columnId: 'done', order: 2 })
  })

  it('writes the move under the card’s own revision', async () => {
    localBackend.moveCard.mockResolvedValue(makeCard())
    localBackend.getBoard.mockResolvedValue({ board: local, cards: [] })
    const { result } = renderActions()

    await result.current.moveCard(makeCard({ revision: 'r-card' }), 'done', 2)
    expect(localBackend.moveCard).toHaveBeenCalledWith(path, 'b1', 'c1', 'done', 2, 'r-card')
  })

  /** A lost race is recoverable by re-reading, so it says so and refreshes rather than throwing at a
   * drag handler that has nowhere to put an error. */
  it('absorbs a lost race into a message and a refresh', async () => {
    localBackend.moveCard.mockRejectedValue(conflict())
    const { result, mutateDetail } = renderActions()

    await expect(result.current.moveCard(makeCard(), 'done', 1)).resolves.toBeUndefined()
    expect(toastError).toHaveBeenCalled()
    // Once for the optimistic write, once to re-read what actually landed.
    expect(mutateDetail).toHaveBeenCalledTimes(2)
  })

  it('lets any other failure through, rather than swallowing it', async () => {
    localBackend.moveCard.mockRejectedValue(new Error('disk full'))
    const { result } = renderActions()

    await expect(result.current.moveCard(makeCard(), 'done', 1)).rejects.toThrow('disk full')
    expect(toastError).not.toHaveBeenCalled()
  })

  it('does nothing before the cards it would move are loaded', async () => {
    const { result } = renderHook(() =>
      useBoardCardActions({
        repoPath: path,
        activeBoard: local,
        boards: [local],
        detail: {
          boardDetail: undefined,
          cardsLoading: true,
          mutateDetail: vi.fn() as never,
          revalidateAllDetails: vi.fn(),
          revisionFor: (b) => b.revision,
          withConflictToast: (run) => run(),
        },
        backendFor: () => localBackend,
        remoteBackend: remoteBackend,
        revalidateLists: vi.fn(),
        trackedRef: () => null,
        token: 'tok',
      })
    )

    await result.current.moveCard(makeCard(), 'done', 1)
    expect(localBackend.moveCard).not.toHaveBeenCalled()
  })
})

describe('useBoardCardActions — deleteCard and untrackCard', () => {
  it('deletes through the backend of the board the card is on', async () => {
    localBackend.deleteCard.mockResolvedValue(undefined)
    const { result } = renderActions()

    await result.current.deleteCard(makeCard())
    expect(localBackend.deleteCard).toHaveBeenCalledWith(path, 'b1', 'c1')
  })

  /**
   * Severing the link is not a reason to lose the content: the card keeps everything the issue put
   * on it and becomes an ordinary local card.
   */
  it('untracks by clearing the link alone', async () => {
    localBackend.updateCard.mockResolvedValue(makeCard())
    const { result } = renderActions()

    await result.current.untrackCard(makeCard({ title: 'Kept' }))
    expect(localBackend.updateCard).toHaveBeenCalledWith(
      path,
      'b1',
      'c1',
      { sourceIssue: null },
      'rev-1'
    )
  })
})

describe('useBoardCardActions — addComment', () => {
  it('refuses to post an empty comment', async () => {
    const { result } = renderActions()

    await expect(result.current.addComment(makeCard(), '   ')).resolves.toBeNull()
    expect(localBackend.addComment).not.toHaveBeenCalled()
  })

  it('trims what it posts, and writes under the card’s revision', async () => {
    localBackend.addComment.mockResolvedValue(makeCard())
    const { result } = renderActions()

    await result.current.addComment(makeCard(), '  Looks good  ')
    expect(localBackend.addComment).toHaveBeenCalledWith(path, 'b1', 'c1', 'Looks good', 'rev-1')
  })
})

/**
 * The archive purge is the board's one bulk-destructive action, so what it takes is worth pinning
 * down: the set is read from the live cards at the moment it runs, and it reaches the backend as one
 * call rather than as a loop of single deletes.
 */
describe('useBoardCardActions — deleteArchivedCards', () => {
  const archived = (id: string) =>
    makeCard({ id, archivedAt: '2026-08-04T00:00:00.000Z' })

  it('sends every archived card, and only those, in one backend call', async () => {
    localBackend.deleteCards.mockResolvedValue(2)
    const { result, mutateDetail } = renderActions(local, [local], () => null, [
      makeCard({ id: 'live' }),
      archived('a1'),
      archived('a2'),
    ])

    await expect(result.current.deleteArchivedCards()).resolves.toBe(2)

    expect(localBackend.deleteCards).toHaveBeenCalledTimes(1)
    expect(localBackend.deleteCards).toHaveBeenCalledWith(path, 'b1', ['a1', 'a2'])
    expect(localBackend.deleteCard).not.toHaveBeenCalled()
    expect(mutateDetail).toHaveBeenCalled()
  })

  /** Nothing archived is not an empty purge to record — it is no purge at all. */
  it('does not reach the backend when the archive is empty', async () => {
    const { result } = renderActions(local, [local], () => null, [makeCard({ id: 'live' })])

    await expect(result.current.deleteArchivedCards()).resolves.toBe(0)
    expect(localBackend.deleteCards).not.toHaveBeenCalled()
  })

  it('goes to the backend the active board belongs to', async () => {
    remoteBackend.deleteCards.mockResolvedValue(1)
    const { result } = renderActions(remote, [remote], () => null, [archived('a1')])

    await result.current.deleteArchivedCards()

    expect(remoteBackend.deleteCards).toHaveBeenCalledWith(path, 'b9', ['a1'])
    expect(localBackend.deleteCards).not.toHaveBeenCalled()
  })
})

/**
 * A column-wide action reaches the set the *board* shows in that column. Archived cards are not in it
 * as far as anyone looking at the board is concerned, which is the rule both actions share.
 */
describe('useBoardCardActions — column-wide actions', () => {
  const inColumn = (id: string, columnId: string, extra = {}) =>
    makeCard({ id, columnId, ...extra })

  const columnCards = [
    inColumn('a1', 'todo'),
    inColumn('a2', 'todo'),
    inColumn('away', 'todo', { archivedAt: '2026-08-04T00:00:00.000Z' }),
    inColumn('elsewhere', 'done'),
  ]

  it('archives a column in one call, skipping what is already away', async () => {
    localBackend.setCardsArchived.mockResolvedValue(2)
    const { result, mutateDetail } = renderActions(local, [local], () => null, columnCards)

    await expect(result.current.archiveColumn('todo')).resolves.toBe(2)

    expect(localBackend.setCardsArchived).toHaveBeenCalledTimes(1)
    expect(localBackend.setCardsArchived).toHaveBeenCalledWith(path, 'b1', ['a1', 'a2'], true)
    expect(mutateDetail).toHaveBeenCalled()
  })

  it('does not reach the backend for a column with nothing on the board', async () => {
    const { result } = renderActions(local, [local], () => null, [
      inColumn('away', 'todo', { archivedAt: '2026-08-04T00:00:00.000Z' }),
    ])

    await expect(result.current.archiveColumn('todo')).resolves.toBe(0)
    expect(localBackend.setCardsArchived).not.toHaveBeenCalled()
  })

  it('moves a column as one bulk move, not card by card', async () => {
    localBackend.moveCardsToBoard.mockResolvedValue(undefined)
    const other = makeBoard({ id: 'b2', source: 'local' })
    const { result, revalidateAllDetails } = renderActions(
      local,
      [local, other],
      () => null,
      columnCards
    )

    await expect(result.current.moveColumnCards('todo', 'b2', 'backlog')).resolves.toBe(2)

    expect(localBackend.moveCardsToBoard).toHaveBeenCalledTimes(1)
    expect(localBackend.moveCardsToBoard).toHaveBeenCalledWith(
      path,
      'b1',
      'b2',
      ['a1', 'a2'],
      'backlog'
    )
    // The destination's cached cards are stale and live under a key `mutateDetail` cannot reach.
    expect(revalidateAllDetails).toHaveBeenCalled()
  })

  /**
   * The local→GitHub direction creates an issue per card. Doing that for a set is not one operation,
   * and a failure part-way leaves a half-moved column no one can describe — so it is refused here as
   * well as kept out of the picker by `columnMoveTargetsFor`.
   */
  it('refuses to empty a column onto the other backend', async () => {
    const { result } = renderActions(local, [local, remote], () => null, columnCards)

    await expect(result.current.moveColumnCards('todo', 'b9', 'todo')).rejects.toThrow()
    expect(localBackend.moveCardsToBoard).not.toHaveBeenCalled()
    expect(remoteBackend.createCard).not.toHaveBeenCalled()
  })

  it('refuses a board that no longer exists', async () => {
    const { result } = renderActions(local, [local], () => null, columnCards)
    await expect(result.current.moveColumnCards('todo', 'gone', 'todo')).rejects.toThrow()
  })
})
