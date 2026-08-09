import type {
  Board,
  BoardColumn,
  BoardSource,
  BoardTag,
  SprintSummary,
} from '@git-manager/git-types'
import type { BoardBackend } from '../api/boardBackend'
import { firstIterationName } from '../lib/boardIteration'
import type { BoardCatalog } from './useBoardCatalog'
import type { BoardDetail } from './useBoardDetail'

interface BoardActionsDeps {
  repoPath: string
  catalog: BoardCatalog
  detail: Pick<BoardDetail, 'mutateDetail' | 'revisionFor' | 'withConflictToast'>
  backendFor: (source: BoardSource) => BoardBackend
}

/**
 * The writes that act on a **board** rather than on a card: creating one, editing its columns or
 * settings, deleting it, and closing a sprint.
 *
 * Every one of them takes the board's own `revision`, so two windows editing the same board reject
 * the second write instead of one silently winning.
 */
export function useBoardActions({ repoPath, catalog, detail, backendFor }: BoardActionsDeps) {
  const { boards, activeBoard, setActiveBoard, revalidateLists } = catalog
  const { mutateDetail, revisionFor, withConflictToast } = detail

  /** `iteration` marks the board as one sprint of a cycle — see `lib/boardIteration`. The name is
   * numbered on the way in, so a first sprint called "Sprint" is created as "Sprint 1" and the close
   * dialog can propose "Sprint 2". */
  async function createBoard(
    name: string,
    columns: BoardColumn[],
    source: BoardSource,
    dodTemplate = '',
    cardPrefix = '',
    iteration = true
  ): Promise<Board> {
    const board = await backendFor(source).createBoard(
      repoPath,
      firstIterationName(name, iteration),
      columns,
      dodTemplate,
      cardPrefix,
      iteration
    )
    revalidateLists()
    setActiveBoard(board.id)
    return board
  }

  async function updateBoardColumns(columns: BoardColumn[]): Promise<void> {
    if (!activeBoard) return
    const result = await withConflictToast(() =>
      backendFor(activeBoard.source).updateBoardColumns(
        repoPath,
        activeBoard.id,
        columns,
        revisionFor(activeBoard)
      )
    )
    if (result) {
      revalidateLists()
      void mutateDetail()
    }
  }

  async function updateBoardMeta(
    name: string,
    tags: BoardTag[],
    dodTemplate: string,
    cardPrefixes: string[]
  ): Promise<void> {
    if (!activeBoard) return
    const result = await withConflictToast(() =>
      backendFor(activeBoard.source).updateBoardMeta(
        repoPath,
        activeBoard.id,
        name,
        tags,
        dodTemplate,
        cardPrefixes,
        revisionFor(activeBoard)
      )
    )
    if (result) {
      revalidateLists()
      void mutateDetail()
    }
  }

  /** `deleteCards` decides whether the board's tickets are erased with it or survive it — the two
   * backends mean different things by that, both documented on {@link BoardBackend.deleteBoard}. */
  async function deleteBoard(board: Board, deleteCards = true): Promise<void> {
    await backendFor(board.source).deleteBoard(repoPath, board.id, deleteCards)
    revalidateLists()
    if (activeBoard?.id === board.id) {
      const next = boards.find((b) => b.id !== board.id)
      if (next) setActiveBoard(next.id)
    }
  }

  /**
   * Ends a sprint: optionally opens a successor with the same setup and **moves** the unfinished
   * cards into it, optionally archives what is left in one column, then freezes `summary` onto the
   * board being closed.
   *
   * The successor is created and filled *before* the close, so a failure part-way leaves a sprint
   * that is still open and still owns its cards — recoverable by retrying — rather than a closed,
   * read-only sprint whose work has nowhere to go.
   *
   * `archiveColumnId` names the column whose remaining cards are put away — normally the one marked
   * done. Three orderings matter and none of them is arbitrary:
   *
   * - **After the carry-over**, because carry-over takes the *unfinished* cards off this board and
   *   archiving must only touch what stayed.
   * - **Before the close**, because a closed board is read-only: archiving afterwards would be a
   *   write to a board that has stopped accepting them.
   * - **After the summary was computed** — which happened in the dialog, before any of this — so the
   *   frozen report counts the finished work rather than reporting an emptied column.
   */
  async function closeSprint(
    summary: SprintSummary,
    successor: { name: string; carryOverCardIds: string[] } | null,
    archiveColumnId?: string | null
  ): Promise<Board | null> {
    if (!activeBoard) return null
    const backend = backendFor(activeBoard.source)

    let carriedOverToBoardId: string | undefined
    // The revision the close will be written under. It is read here and then kept up to date by
    // hand, because the carry-over below writes to *this* board as well — see there.
    let expectedRevision = revisionFor(activeBoard)
    if (successor) {
      const next = await backend.createBoard(
        repoPath,
        successor.name,
        activeBoard.columns,
        activeBoard.dodTemplate,
        // The successor offers the same prefixes; the carried-over cards keep their own identifiers
        // regardless, since a prefix belongs to the card.
        activeBoard.cardPrefixes[0] ?? '',
        // The successor of an iteration is an iteration. Nothing else can reach this branch: only an
        // iteration is offered a close, and the name is already numbered, so `firstIterationName`
        // leaves what `nextSprintName` proposed exactly as it is.
        true
      )
      if (successor.carryOverCardIds.length > 0) {
        await backend.moveCardsToBoard(
          repoPath,
          activeBoard.id,
          next.id,
          successor.carryOverCardIds
        )
        // Carrying cards out commits on the board they leave too ("carry cards out of sprint"), so
        // its revision — the ref tip on the local backend — has already moved past the one read
        // above. Closing under the stale one loses the compare-and-swap, and the whole gesture then
        // ended in a conflict toast and a sprint still open, with its leftovers already gone to the
        // successor. `revisionFor` reads the render's `boardDetail` and cannot see this refresh, so
        // the revision is taken from what the refetch returns rather than from it.
        const refreshed = await mutateDetail()
        if (refreshed) expectedRevision = refreshed.board.revision
      }
      carriedOverToBoardId = next.id
    }

    if (archiveColumnId) {
      const remaining = await backend.getBoard(repoPath, activeBoard.id)
      const toArchive = remaining.cards
        .filter((c) => c.columnId === archiveColumnId && !c.archivedAt)
        .map((c) => c.id)
      if (toArchive.length > 0) {
        await backend.setCardsArchived(repoPath, activeBoard.id, toArchive, true)
        // Same reason the carry-over refreshes: archiving commits on this board, so the revision read
        // before it is already behind and the close's compare-and-swap would be rejected.
        const refreshed = await mutateDetail()
        if (refreshed) expectedRevision = refreshed.board.revision
      }
    }

    const closed = await withConflictToast(() =>
      backend.closeBoard(
        repoPath,
        activeBoard.id,
        { ...summary, carriedOverToBoardId },
        expectedRevision
      )
    )
    revalidateLists()
    void mutateDetail()
    if (carriedOverToBoardId) setActiveBoard(carriedOverToBoardId)
    return closed
  }

  return { createBoard, updateBoardColumns, updateBoardMeta, deleteBoard, closeSprint }
}
