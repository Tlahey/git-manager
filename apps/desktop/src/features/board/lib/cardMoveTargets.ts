import type { Board, BoardCard } from '@git-manager/git-types'

/**
 * The boards a card may be moved to, and the column it should land in.
 *
 * Four rules, each for its own reason:
 *
 * - **Not its own board.** Moving a card within a board is what dragging it does.
 * - **Not a closed sprint.** A closed board is read-only and its statistics are frozen; dropping a
 *   card into one would make a finished sprint report a total it never had.
 * - **A GitHub card cannot move to a local board.** The other direction *creates* the issue, so it
 *   has somewhere to put the card; this one would have to destroy one, and closing someone's issue
 *   is not what "move to my private board" means. Tracking (`useCardIssueTracking`) is the supported
 *   way to give an issue a local home, and it leaves the issue open.
 * - **A card that already *tracks* an issue is offered no GitHub board at all.** Moving one there
 *   would take the local→GitHub path, which *creates* an issue — producing a second issue that
 *   copies the first, while the original stays open and the card that linked them is deleted. The
 *   card is already the issue's representative; what it needs is not a copy of itself.
 */
export function moveTargetsFor(boards: Board[], card: BoardCard, source: Board['source']): Board[] {
  return boards.filter(
    (board) =>
      board.id !== card.boardId &&
      !board.closedAt &&
      (source === 'local' || board.source === 'remote') &&
      !(card.sourceIssue && board.source === 'remote')
  )
}

/**
 * Which column the card lands in on `target`, by default.
 *
 * A board that has a column by the same id gets the card in *that* one — "in progress" stays "in
 * progress" across a sprint boundary, which is the whole reason columns carry ids rather than
 * positions. Otherwise it lands in the first column, since the alternative is landing nowhere.
 */
export function defaultColumnFor(target: Board, currentColumnId: string): string {
  if (target.columns.some((c) => c.id === currentColumnId)) return currentColumnId
  return [...target.columns].sort((a, b) => a.order - b.order)[0]?.id ?? ''
}
