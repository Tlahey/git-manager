import type {
  Board,
  BoardCard,
  BoardCardPatch,
  NewBoardCard,
  BoardColumn,
  BoardTag,
  BoardWithCards,
  SprintSummary,
} from '@git-manager/git-types'

/**
 * The one contract both board backends implement — `BoardPage` (see the feature root) picks an
 * implementation per-board via `Board.source` and never branches on backend beyond that, since the
 * UI renders `Board`/`BoardCard` generically (see the shared data model in `@git-manager/git-types`).
 *
 * `expectedRevision` on the update/move methods is the caller's last-seen `Board`/`BoardCard.revision`
 * — a mismatch rejects with a `BOARD_CONFLICT`-coded error (local backend) or an equivalent staleness
 * error (remote backend) instead of silently overwriting a write that landed in between.
 *
 * Every card field lives here, on both backends: the UI never branches on `source`, so a field one
 * backend quietly dropped would look saved and come back empty. Where GitHub has a native home for
 * one (assignee, labels, comments, task lists) the remote backend uses it — see its module comment.
 */
export interface BoardBackend {
  listBoards(path: string): Promise<Board[]>
  getBoard(path: string, boardId: string): Promise<BoardWithCards>
  createBoard(
    path: string,
    name: string,
    columns: BoardColumn[],
    dodTemplate: string,
    /** Prefix for this board's card identifiers — `"GM"` makes the first card `GM-1`. */
    cardPrefix: string
  ): Promise<Board>
  updateBoardColumns(
    path: string,
    boardId: string,
    columns: BoardColumn[],
    expectedRevision: string
  ): Promise<Board>
  /** Board-level settings: name, tag palette, Definition-of-Done template, card prefix. */
  updateBoardMeta(
    path: string,
    boardId: string,
    name: string,
    tags: BoardTag[],
    dodTemplate: string,
    /** The prefixes this board offers at card creation — see {@link Board.cardPrefixes}. */
    cardPrefixes: string[],
    expectedRevision: string
  ): Promise<Board>
  /** Closes a sprint, freezing the summary the caller computed — see `../lib/sprintStats.ts`. */
  closeBoard(
    path: string,
    boardId: string,
    summary: SprintSummary,
    expectedRevision: string
  ): Promise<Board>
  deleteBoard(path: string, boardId: string): Promise<void>
  /** `card` carries the new card's own identity (title, prefix, kind, and optionally the GitHub
   * issue it tracks from its first commit); `columnId` is the placement. */
  createCard(
    path: string,
    boardId: string,
    columnId: string,
    card: NewBoardCard
  ): Promise<BoardCard>
  updateCard(
    path: string,
    boardId: string,
    cardId: string,
    patch: BoardCardPatch,
    expectedRevision: string
  ): Promise<BoardCard>
  /** Comments are append-only, which is why they're their own call rather than part of a patch. */
  addComment(
    path: string,
    boardId: string,
    cardId: string,
    body: string,
    expectedRevision: string
  ): Promise<BoardCard>
  moveCard(
    path: string,
    boardId: string,
    cardId: string,
    columnId: string,
    order: number,
    expectedRevision: string
  ): Promise<BoardCard>
  /** Sprint carry-over, and moving a ticket to another board of the same backend. Cards **move**
   * rather than being copied: duplicating a GitHub issue would be wrong, and "the leftovers went to
   * the next sprint" is what actually happened. `toColumnId` places them explicitly; carry-over
   * omits it, wanting each card's own column where the target board has one by that id. */
  moveCardsToBoard(
    path: string,
    fromBoardId: string,
    toBoardId: string,
    cardIds: string[],
    toColumnId?: string
  ): Promise<void>
  deleteCard(path: string, boardId: string, cardId: string): Promise<void>
}
