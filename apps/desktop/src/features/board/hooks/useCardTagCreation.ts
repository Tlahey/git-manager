import type { Board, BoardCard, BoardSource, BoardTag } from '@git-manager/git-types'
import { nextTagColor, tagIdFromName } from '../lib/boardDefaults'
import type { BoardBackend } from '../api/boardBackend'
import type { BoardDetail } from './useBoardDetail'

interface CardTagCreationDeps {
  repoPath: string
  activeBoard: Board | null
  detail: Pick<BoardDetail, 'mutateDetail' | 'withConflictToast'>
  backendFor: (source: BoardSource) => BoardBackend
  revalidateLists: () => void
}

/**
 * Creates a tag on the board and puts it on the card, in that order.
 *
 * The order is why this is its own operation rather than something the picker does. On the local
 * backend a card's `revision` is the *board's* ref tip — a whole-board version stamp, see
 * `git_board.rs` — so writing the palette moves it, and patching the card afterwards with the
 * revision captured before that write is a guaranteed `BOARD_CONFLICT`. The detail is therefore
 * re-read in between and the patch built from the card as it now stands.
 */
export function useCardTagCreation({
  repoPath,
  activeBoard,
  detail,
  backendFor,
  revalidateLists,
}: CardTagCreationDeps) {
  const { mutateDetail, withConflictToast } = detail

  return async function createTagAndAssign(card: BoardCard, name: string): Promise<BoardTag | null> {
    if (!activeBoard) return null
    const trimmed = name.trim()
    if (!trimmed) return null

    const backend = backendFor(activeBoard.source)
    // Read the board straight from the backend rather than trusting either cache: on a local board a
    // revision is the ref tip, which advances on *every* write — including card writes, which don't
    // revalidate the board list. Both halves of this operation are built from a fresh read for that
    // reason; using a held copy is what made the palette write fail outright.
    const { board: current } = await backend.getBoard(repoPath, activeBoard.id)

    const id = tagIdFromName(trimmed)
    const existing = current.tags.find(
      (tag) => tag.id === id || tag.name.toLowerCase() === trimmed.toLowerCase()
    )
    const tag: BoardTag = existing ?? { id, name: trimmed, color: nextTagColor(current.tags.length) }

    if (!existing) {
      const board = await withConflictToast(() =>
        backend.updateBoardMeta(
          repoPath,
          current.id,
          current.name,
          [...current.tags, tag],
          current.dodTemplate,
          current.cardPrefixes,
          current.revision
        )
      )
      if (!board) return null
      revalidateLists()
    }

    // Read again: the palette write just moved the revision the card carries.
    const { cards } = await backend.getBoard(repoPath, activeBoard.id)
    const freshCard = cards.find((c) => c.id === card.id)
    if (!freshCard) return tag
    if (freshCard.tagIds.includes(tag.id)) return tag

    const assigned = await withConflictToast(() =>
      backend.updateCard(
        repoPath,
        activeBoard.id,
        freshCard.id,
        { tagIds: [...freshCard.tagIds, tag.id] },
        freshCard.revision
      )
    )
    void mutateDetail()
    return assigned ? tag : null
  }
}
