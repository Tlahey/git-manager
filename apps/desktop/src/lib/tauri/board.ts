import { invoke } from './invoke'
import type {
  GitCommit,
  Board,
  BoardColumn,
  BoardCard,
  BoardCardPatch,
  NewBoardCard,
  BoardTag,
  BoardWithCards,
  SprintSummary,
} from '@git-manager/git-types'

// ─── Board (Kanban) — local, git-native backend ───────────────────────────────

export const listBoards = (path: string) => invoke<Board[]>('list_boards', { path })

export const getBoard = (path: string, boardId: string) =>
  invoke<BoardWithCards>('get_board', { path, boardId })

export const createBoard = (
  path: string,
  name: string,
  columns: BoardColumn[],
  dodTemplate: string,
  cardPrefix: string,
  iteration: boolean
) => invoke<Board>('create_board', { path, name, columns, dodTemplate, cardPrefix, iteration })

export const updateBoardMeta = (
  path: string,
  boardId: string,
  name: string,
  tags: BoardTag[],
  dodTemplate: string,
  cardPrefixes: string[],
  expectedRevision: string
) =>
  invoke<Board>('update_board_meta', {
    path,
    boardId,
    name,
    tags,
    dodTemplate,
    cardPrefixes,
    expectedRevision,
  })

export const closeBoard = (
  path: string,
  boardId: string,
  summary: SprintSummary,
  expectedRevision: string
) => invoke<Board>('close_board', { path, boardId, summary, expectedRevision })

/** Moves cards between boards preserving their id, identifier, comments and DOD — the sprint
 * carry-over, and the "move this ticket to another board" action. `toColumnId` is omitted by the
 * former, which wants each card's own column where the target board has it. */
export const moveBoardCards = (
  path: string,
  fromBoardId: string,
  toBoardId: string,
  cardIds: string[],
  toColumnId?: string
) =>
  invoke<void>('move_board_cards', {
    path,
    fromBoardId,
    toBoardId,
    cardIds,
    toColumnId: toColumnId ?? null,
  })

export const updateBoardColumns = (
  path: string,
  boardId: string,
  columns: BoardColumn[],
  expectedRevision: string
) => invoke<Board>('update_board_columns', { path, boardId, columns, expectedRevision })

/** `deleteCards` erases the board and its tickets; otherwise the board is tombstoned and its cards
 * archived, so they stay attached to it. */
export const deleteBoard = (path: string, boardId: string, deleteCards: boolean) =>
  invoke<void>('delete_board', { path, boardId, deleteCards })

export const createBoardCard = (
  path: string,
  boardId: string,
  columnId: string,
  card: NewBoardCard
) => invoke<BoardCard>('create_board_card', { path, boardId, columnId, card })

export const updateBoardCard = (
  path: string,
  boardId: string,
  cardId: string,
  patch: BoardCardPatch,
  expectedRevision: string
) => invoke<BoardCard>('update_board_card', { path, boardId, cardId, patch, expectedRevision })

export const moveBoardCard = (
  path: string,
  boardId: string,
  cardId: string,
  columnId: string,
  order: number,
  expectedRevision: string
) =>
  invoke<BoardCard>('move_board_card', { path, boardId, cardId, columnId, order, expectedRevision })

/** The comment's author is stamped in Rust from the repo's git signature, so none is passed here. */
export const addBoardCardComment = (
  path: string,
  boardId: string,
  cardId: string,
  body: string,
  expectedRevision: string
) => invoke<BoardCard>('add_board_card_comment', { path, boardId, cardId, body, expectedRevision })

export const deleteBoardCard = (path: string, boardId: string, cardId: string) =>
  invoke<void>('delete_board_card', { path, boardId, cardId })

/** Deletes a set of cards in one board commit — the archived-card purge. Resolves with how many
 * were actually removed, which is fewer than asked when one had already gone. */
export const deleteBoardCards = (path: string, boardId: string, cardIds: string[]) =>
  invoke<number>('delete_board_cards', { path, boardId, cardIds })

/** Archives (or un-archives) a set of cards in one board commit, all under the same instant.
 * Resolves with how many actually changed state. */
export const setBoardCardsArchived = (
  path: string,
  boardId: string,
  cardIds: string[],
  archived: boolean
) => invoke<number>('set_board_cards_archived', { path, boardId, cardIds, archived })

/** Numbers every card that has no identifier, from `prefix`'s sequence, in one board commit.
 * Resolves with how many cards were numbered — cards that already carry one are left alone. */
export const assignBoardCardIdentifiers = (path: string, boardId: string, prefix: string) =>
  invoke<number>('assign_board_card_identifiers', { path, boardId, prefix })

export const getBoardHistory = (path: string, boardId: string) =>
  invoke<GitCommit[]>('get_board_history', { path, boardId })

export const listRecoverableBoards = (path: string) =>
  invoke<Board[]>('list_recoverable_boards', { path })

export const restoreBoardBackup = (path: string, boardId: string) =>
  invoke<Board>('restore_board_backup', { path, boardId })

// ─── Board (Kanban) — remote board's committed config file ────────────────────

export const writeBoardConfig = (path: string, contents: string) =>
  invoke<void>('write_board_config', { path, contents })

/** `null` when `.git-manager/board.json` doesn't exist yet (no remote board created in this repo). */
export const readBoardConfig = (path: string) =>
  invoke<string | null>('read_board_config', { path })

/** Writes a card attachment into `.git-manager/attachments/` and returns its repo-relative path.
 * The stored filename is the content's own blob hash, so the same image pasted twice is stored once;
 * `fileName` only contributes its extension. */
export const saveBoardAttachment = (path: string, fileName: string, bytes: number[]) =>
  invoke<string>('save_board_attachment', { path, fileName, bytes })
