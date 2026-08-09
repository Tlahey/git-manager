import useSWR from 'swr'
import type { Board } from '@git-manager/git-types'
import { useBoardBackends } from './useBoardBackends'
import { useBoardCatalog } from './useBoardCatalog'
import type { CardOnBoard } from '../lib/searchCards'

export interface AllBoardCards {
  cards: CardOnBoard[]
  loading: boolean
  /**
   * Boards whose cards could not be read — a GitHub call that failed, a local board whose ref is
   * gone. Surfaced rather than swallowed **because a search that quietly skips a board answers "not
   * found" when the truthful answer is "not found in the ones I could read"**, and the user has no
   * way to tell the difference from the outside.
   */
  unreadable: Board[]
}

/**
 * Every card of every board of one repository, flattened, for the cross-board ticket search.
 *
 * **Gated on `enabled`**, and that is not an optimisation: this fetches one board detail per board,
 * against both backends, and on a repo with a dozen remote boards that is a dozen GitHub round trips.
 * It runs while the search dialog is open and not otherwise — the board view itself needs only the
 * board it is showing, which `useBoardDetail` fetches on its own key.
 *
 * One SWR key for the whole sweep rather than one per board, because the number of boards is not
 * known at render time and a hook cannot be called in a loop. The key carries the board identities,
 * so adding or removing a board re-reads; it deliberately does *not* carry their revisions, since a
 * card written on another board should not invalidate the sweep mid-search.
 *
 * Tracked GitHub issues are **not** merged in here, unlike `useBoardDetail`: that is one API call per
 * tracked card, and the search matches identifier/title/assignee/board — fields the card carries
 * itself. What a stale tracked card can be wrong about here is its issue state, which the search does
 * not read.
 */
export function useAllBoardCards(repoPath: string, enabled: boolean): AllBoardCards {
  const { remoteBackend, backendFor, token } = useBoardBackends(repoPath)
  const { boards, boardsLoading } = useBoardCatalog(repoPath, remoteBackend)

  const boardKey = boards.map((b) => `${b.source}:${b.id}`).join(',')
  const { data, isLoading } = useSWR(
    enabled && boards.length > 0
      ? ['board-cards-all', repoPath, boardKey, Boolean(token)]
      : null,
    async () => {
      const cards: CardOnBoard[] = []
      const unreadable: Board[] = []
      // Sequential rather than `Promise.all`: the remote backend is a GitHub client, and a dozen
      // parallel board reads is how a search gets rate-limited into failing for everyone.
      for (const board of boards) {
        try {
          const detail = await backendFor(board.source).getBoard(repoPath, board.id)
          for (const card of detail.cards) cards.push({ card, board })
        } catch {
          unreadable.push(board)
        }
      }
      return { cards, unreadable }
    },
    { revalidateOnFocus: false }
  )

  return {
    cards: data?.cards ?? [],
    loading: boardsLoading || (enabled && isLoading),
    unreadable: data?.unreadable ?? [],
  }
}
