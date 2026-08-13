import { localBoardBackend } from './local-board.api'
import { defaultArchiveColumnId } from '../lib/sprintStats'

/**
 * Closes the loop the "create branch for card" action opens: a branch just merged, so every open
 * card across the repo's boards that names it as its `linkedBranch` moves to its board's done
 * column (the same column a sprint close archives into — see `defaultArchiveColumnId`).
 *
 * **Local boards only.** This runs from `apiMergeBranch`, outside any React tree — there is no
 * account id in scope to build a remote (GitHub) backend from, unlike `useAllBoardCards`, which can
 * read one off the render it's called from. A card tracking a GitHub issue is not silently wrong
 * for it: its "done" is the issue's own state, which git-manager doesn't drive either way.
 *
 * **Best-effort, per board and per card.** A merge that already landed must not look like it failed
 * because one board's ref is momentarily locked or one card's revision went stale under it — either
 * is caught and skipped rather than aborting the sweep, so a problem with one card or board never
 * costs the others their move. Boards are read sequentially, same as `useAllBoardCards`, since
 * nothing here is latency-sensitive enough to justify parallel writes racing on the same board.
 */
export async function markCardsDoneForMergedBranch(
  repoPath: string,
  branch: string
): Promise<void> {
  const boards = await localBoardBackend.listBoards(repoPath)
  for (const board of boards) {
    const doneColumnId = defaultArchiveColumnId(board.columns)
    if (!doneColumnId) continue

    let cards
    try {
      cards = (await localBoardBackend.getBoard(repoPath, board.id)).cards
    } catch {
      continue
    }

    for (const card of cards) {
      if (card.linkedBranch !== branch) continue
      if (card.archivedAt || card.columnId === doneColumnId) continue
      try {
        await localBoardBackend.updateCard(
          repoPath,
          board.id,
          card.id,
          { columnId: doneColumnId },
          card.revision
        )
      } catch {
        // Stale revision, or the board changed under us — the next merge (or the user, by hand)
        // gets another chance; nothing here is worth surfacing an error for.
      }
    }
  }
}
