import useSWR from 'swr'
import type { Board } from '@git-manager/git-types'
import { apiListRecoverableBoards, apiRestoreBoardBackup } from '../api/local-board.api'

interface RecoverableBoardsDeps {
  repoPath: string
  setActiveBoard: (boardId: string) => void
  revalidateLists: () => void
}

/**
 * Boards whose ref is gone but whose `~/.git-manager/boards/` disaster-recovery mirror still holds
 * them (see `git_board.rs`'s module doc comment) — the case where the repository itself was deleted
 * and re-cloned, wiping every board ref along with it since they are never pushed. Local-only, for
 * the same reason as `useCardHistory`: no remote-backend equivalent, so this reads and writes
 * straight through `local-board.api` rather than `backendFor`.
 *
 * Fetched under its own SWR key so a repo with nothing to recover costs one cheap directory read, not
 * a wait on the boards the page already fetches. Each entry carries the card count and the board's
 * own `updatedAt` — see `RecoverableBoard`: several lost clones of the same repository mean several
 * boards of the same *name*, and the row has to be choosable.
 */
export function useRecoverableBoards({
  repoPath,
  setActiveBoard,
  revalidateLists,
}: RecoverableBoardsDeps) {
  const { data, isLoading, mutate } = useSWR(
    ['board-recoverable', repoPath],
    () => apiListRecoverableBoards(repoPath),
    { revalidateOnFocus: false }
  )

  /** Restores, then jumps straight to it — the same "land on what you just made" behaviour as
   * `createBoard`. Its ref restored, it drops out of this list on the next read and reappears in the
   * ordinary board list, which `revalidateLists` refreshes. */
  async function restoreBoard(boardId: string): Promise<Board> {
    const board = await apiRestoreBoardBackup(repoPath, boardId)
    void mutate()
    revalidateLists()
    setActiveBoard(board.id)
    return board
  }

  return {
    recoverableBoards: data ?? [],
    recoverableBoardsLoading: isLoading,
    restoreBoard,
  }
}
