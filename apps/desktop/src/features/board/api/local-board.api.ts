import {
  listBoards,
  getBoard,
  createBoard,
  updateBoardColumns,
  updateBoardMeta,
  closeBoard,
  deleteBoard,
  createBoardCard,
  updateBoardCard,
  addBoardCardComment,
  moveBoardCard,
  moveBoardCards,
  deleteBoardCard,
  getBoardHistory,
  listRecoverableBoards,
  restoreBoardBackup,
} from '../../../lib/tauri'
import type { BoardBackend } from './boardBackend'

/**
 * Git-native local board backend — every call is a thin pass-through to the `board_*` Tauri
 * commands (`services/git_board.rs`). Deliberately **not** wired into `stores/undoHistory.store.ts`
 * — a v1 scope cut, not an oversight (see the plan for issue #259): local card mutations are their
 * own commit history already (`apiGetBoardHistory`/`board_history`), which is a different, coarser
 * kind of undo than ⌘Z. Follows the same "plain pass-through skips undo bookkeeping" rule documented
 * in `api/service.ts` for calls with no gamification event to raise either.
 */
export const localBoardBackend: BoardBackend = {
  listBoards: (path) => listBoards(path),
  getBoard: (path, boardId) => getBoard(path, boardId),
  createBoard: (path, name, columns, dodTemplate, cardPrefix) =>
    createBoard(path, name, columns, dodTemplate, cardPrefix),
  updateBoardColumns: (path, boardId, columns, expectedRevision) =>
    updateBoardColumns(path, boardId, columns, expectedRevision),
  updateBoardMeta: (path, boardId, name, tags, dodTemplate, cardPrefixes, expectedRevision) =>
    updateBoardMeta(path, boardId, name, tags, dodTemplate, cardPrefixes, expectedRevision),
  closeBoard: (path, boardId, summary, expectedRevision) =>
    closeBoard(path, boardId, summary, expectedRevision),
  deleteBoard: (path, boardId) => deleteBoard(path, boardId),
  createCard: (path, boardId, columnId, card) => createBoardCard(path, boardId, columnId, card),
  updateCard: (path, boardId, cardId, patch, expectedRevision) =>
    updateBoardCard(path, boardId, cardId, patch, expectedRevision),
  addComment: (path, boardId, cardId, body, expectedRevision) =>
    addBoardCardComment(path, boardId, cardId, body, expectedRevision),
  moveCard: (path, boardId, cardId, columnId, order, expectedRevision) =>
    moveBoardCard(path, boardId, cardId, columnId, order, expectedRevision),
  moveCardsToBoard: (path, fromBoardId, toBoardId, cardIds, toColumnId) =>
    moveBoardCards(path, fromBoardId, toBoardId, cardIds, toColumnId),
  deleteCard: (path, boardId, cardId) => deleteBoardCard(path, boardId, cardId),
}

/** The board's full commit history — every card/column change is a commit (see `git_board.rs`'s
 * module doc comment). Local-only: the remote backend has no equivalent, GitHub's own issue/label
 * history serves that role there. */
export const apiGetBoardHistory = (path: string, boardId: string) => getBoardHistory(path, boardId)

/** Boards recoverable from the `~/.git-manager/boards/` disaster-recovery backup after the repo
 * itself was deleted and re-cloned (see `git_board.rs`'s module doc comment). Local-only. */
export const apiListRecoverableBoards = (path: string) => listRecoverableBoards(path)

export const apiRestoreBoardBackup = (path: string, boardId: string) => restoreBoardBackup(path, boardId)
