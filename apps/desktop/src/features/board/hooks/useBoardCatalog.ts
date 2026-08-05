import { useMemo } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import type { Board, BoardSource } from '@git-manager/git-types'
import { useBoardStore } from '../stores/board.store'
import { localBoardBackend } from '../api/local-board.api'
import type { BoardBackend } from '../api/boardBackend'

export interface BoardCatalog {
  /** Every board for this repo, local ones first. */
  boards: Board[]
  boardsLoading: boolean
  /** The board on screen: the one the user last picked, else the first that exists. */
  activeBoard: Board | null
  setActiveBoard: (boardId: string) => void
  /** Re-reads both lists — after any write that changes a board's own record. */
  revalidateLists: () => void
}

/**
 * The repo's boards, from both backends, and which one is open.
 *
 * The two lists are fetched separately rather than behind one key: a repo with no GitHub account has
 * no remote list to fetch at all, and a failing GitHub call must not take the local boards down with
 * it. The selection is persisted per repo (`../stores/board.store.ts`) and falls back to the first
 * board, so a board deleted elsewhere never leaves the page pointing at nothing.
 */
export function useBoardCatalog(
  repoPath: string,
  remoteBackend: BoardBackend | null
): BoardCatalog {
  const { mutate: globalMutate } = useSWRConfig()

  const { data: localBoards, isLoading: localLoading } = useSWR(
    ['board-list', 'local' as BoardSource, repoPath],
    () => localBoardBackend.listBoards(repoPath),
    { revalidateOnFocus: false }
  )
  const { data: remoteBoards, isLoading: remoteLoading } = useSWR(
    remoteBackend ? ['board-list', 'remote', repoPath] : null,
    () => remoteBackend!.listBoards(repoPath),
    { revalidateOnFocus: false }
  )

  const boards = useMemo(
    () => [...(localBoards ?? []), ...(remoteBoards ?? [])],
    [localBoards, remoteBoards]
  )

  const storedActiveId = useBoardStore((s) => s.activeBoardIdByRepo[repoPath])
  const setActiveBoardInStore = useBoardStore((s) => s.setActiveBoard)
  const activeBoard = boards.find((b) => b.id === storedActiveId) ?? boards[0] ?? null

  return {
    boards,
    boardsLoading: localLoading || remoteLoading,
    activeBoard,
    setActiveBoard: (boardId: string) => setActiveBoardInStore(repoPath, boardId),
    revalidateLists: () => {
      void globalMutate((key) => Array.isArray(key) && key[0] === 'board-list')
    },
  }
}
