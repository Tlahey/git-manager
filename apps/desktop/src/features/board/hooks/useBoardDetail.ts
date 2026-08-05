import useSWR, { type KeyedMutator } from 'swr'
import { toast } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type { Board, BoardSource, BoardWithCards } from '@git-manager/git-types'
import { mergeTrackedIssues } from '../api/trackedIssue.api'
import { isBoardConflict } from '../api/boardConflict'
import type { BoardBackend } from '../api/boardBackend'

export interface BoardDetail {
  boardDetail: BoardWithCards | undefined
  cardsLoading: boolean
  mutateDetail: KeyedMutator<BoardWithCards>
  /** The board to build a board-level write's `expectedRevision` from — see below. */
  revisionFor: (board: Board) => string
  /** Runs a CAS-guarded mutation, absorbing a lost race into a toast + refresh. */
  withConflictToast: <T>(run: () => Promise<T>) => Promise<T | null>
}

/**
 * The open board's cards, and the two things every mutation of them needs: the revision to write
 * under, and the conflict handling.
 *
 * Tracked cards are merged in here rather than in each caller, so the rest of the app sees one card
 * list whose contents are already the issue's where an issue owns them.
 */
export function useBoardDetail(
  repoPath: string,
  activeBoard: Board | null,
  backendFor: (source: BoardSource) => BoardBackend,
  token: string | null
): BoardDetail {
  const { t } = useTranslation('board')

  const {
    data: boardDetail,
    isLoading: cardsLoading,
    mutate: mutateDetail,
  } = useSWR(
    // `Boolean(token)` is part of the key so the board refetches when a GitHub account is connected
    // or disconnected: without a token the tracked cards below can't be merged, and the difference
    // is visible on screen.
    activeBoard ? ['board-detail', activeBoard.source, repoPath, activeBoard.id, Boolean(token)] : null,
    async () => {
      const detail = await backendFor(activeBoard!.source).getBoard(repoPath, activeBoard!.id)
      // Only a local board can hold tracked cards — a remote card already *is* an issue.
      if (activeBoard!.source !== 'local' || !token) return detail
      return { ...detail, cards: await mergeTrackedIssues(detail.board, detail.cards, token) }
    },
    { revalidateOnFocus: false }
  )

  /**
   * `activeBoard` comes from the board **list**, which no card mutation revalidates — and on the
   * local backend a board's revision is its ref tip, so it advances every time a card is written.
   * The detail fetch *is* revalidated by those writes, so its copy is the one that stays current;
   * using the list's would reject the next board-level write as a conflict.
   */
  function revisionFor(board: Board): string {
    return boardDetail?.board.id === board.id ? boardDetail.board.revision : board.revision
  }

  /** On a `BOARD_CONFLICT`, toasts and refreshes instead of throwing — every other error still
   * propagates for the caller's own error handling. */
  async function withConflictToast<T>(run: () => Promise<T>): Promise<T | null> {
    try {
      return await run()
    } catch (error) {
      if (isBoardConflict(error)) {
        toast.error(t('conflict.message'))
        await mutateDetail()
        return null
      }
      throw error
    }
  }

  return { boardDetail, cardsLoading, mutateDetail, revisionFor, withConflictToast }
}
