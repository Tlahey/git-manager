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
    cardPrefix: string,
    /** Whether this board is one iteration of a cycle — see {@link Board.iteration}. */
    iteration: boolean
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
  /**
   * Deletes the board. `deleteCards` says what becomes of its tickets, and the two backends honour it
   * differently because the tickets are different things:
   *
   * - **Local.** The cards live inside the board's ref, so they always go with it. What `deleteCards`
   *   controls is the `~/.git-manager/boards/` mirror — the only copy left. Keeping it leaves the
   *   board listed as recoverable, so it and every card can be restored.
   * - **Remote.** The cards are GitHub issues and survive the board either way, since deleting a
   *   board only stops labelling them. `deleteCards` closes them.
   */
  deleteBoard(path: string, boardId: string, deleteCards: boolean): Promise<void>
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
  /**
   * Deletes a whole set of cards — the archived-card purge (see `ArchivedCardsDialog`).
   *
   * Its own method rather than a loop over {@link BoardBackend.deleteCard} at the call site, because
   * the two backends can honour "one gesture" differently and only they know how: the local one
   * writes a single board commit for the set, where a loop would bury the board's history under one
   * "delete board card" entry per card. Resolves with how many were actually removed — a card another
   * window deleted in between is skipped rather than failing the rest of the purge.
   */
  deleteCards(path: string, boardId: string, cardIds: string[]): Promise<number>
  /**
   * Archives — or un-archives — a whole set of cards: "archive this column", and the sprint close's
   * offer to put the finished work away.
   *
   * The reversible neighbour of {@link BoardBackend.deleteCards}, and its own method for the same
   * reason: the local backend records the set as one commit under one instant, so the archive list
   * orders them as the single event they were, where a loop of patches would stamp each card a
   * millisecond apart and spend a commit on every one. Resolves with how many actually changed —
   * a card already in the requested state is left untouched rather than restamped.
   */
  setCardsArchived(
    path: string,
    boardId: string,
    cardIds: string[],
    archived: boolean
  ): Promise<number>
}
