import type {
  Board,
  BoardColumn,
  BoardSource,
  BoardTag,
  SprintSummary,
} from '@git-manager/git-types'
import type { BoardBackend } from '../api/boardBackend'
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

  async function createBoard(
    name: string,
    columns: BoardColumn[],
    source: BoardSource,
    dodTemplate = '',
    cardPrefix = ''
  ): Promise<Board> {
    const board = await backendFor(source).createBoard(repoPath, name, columns, dodTemplate, cardPrefix)
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

  async function deleteBoard(board: Board): Promise<void> {
    await backendFor(board.source).deleteBoard(repoPath, board.id)
    revalidateLists()
    if (activeBoard?.id === board.id) {
      const next = boards.find((b) => b.id !== board.id)
      if (next) setActiveBoard(next.id)
    }
  }

  /**
   * Ends a sprint: optionally opens a successor with the same setup and **moves** the unfinished
   * cards into it, then freezes `summary` onto the board being closed.
   *
   * The successor is created and filled *before* the close, so a failure part-way leaves a sprint
   * that is still open and still owns its cards — recoverable by retrying — rather than a closed,
   * read-only sprint whose work has nowhere to go.
   */
  async function closeSprint(
    summary: SprintSummary,
    successor: { name: string; carryOverCardIds: string[] } | null
  ): Promise<Board | null> {
    if (!activeBoard) return null
    const backend = backendFor(activeBoard.source)

    let carriedOverToBoardId: string | undefined
    if (successor) {
      const next = await backend.createBoard(
        repoPath,
        successor.name,
        activeBoard.columns,
        activeBoard.dodTemplate,
        // The successor offers the same prefixes; the carried-over cards keep their own identifiers
        // regardless, since a prefix belongs to the card.
        activeBoard.cardPrefixes[0] ?? ''
      )
      if (successor.carryOverCardIds.length > 0) {
        await backend.moveCardsToBoard(repoPath, activeBoard.id, next.id, successor.carryOverCardIds)
      }
      carriedOverToBoardId = next.id
    }

    const closed = await withConflictToast(() =>
      backend.closeBoard(
        repoPath,
        activeBoard.id,
        { ...summary, carriedOverToBoardId },
        revisionFor(activeBoard)
      )
    )
    revalidateLists()
    void mutateDetail()
    if (carriedOverToBoardId) setActiveBoard(carriedOverToBoardId)
    return closed
  }

  return { createBoard, updateBoardColumns, updateBoardMeta, deleteBoard, closeSprint }
}
