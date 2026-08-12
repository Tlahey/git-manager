import type { Board, BoardComment } from '@git-manager/git-types'
import { fetchIssueComments } from '../../../api/github/github-issues.api'
import { addLabels } from '../../../api/github/github-labels.api'
import { readConfigFile, writeConfigFile } from './remoteBoardConfigFile'
import {
  BLOCKED_LABEL,
  BLOCKED_LABEL_COLOR,
  PRIORITY_LABELS,
  boardColumnLabel,
} from './remoteCardMapping'
import type { BoardBackend } from './boardBackend'
import { createRemoteBoardContext } from './remoteBoardContext'
import { createBoardOps } from './remoteBoardOps'
import { createCardOps } from './remoteCardOps'

/**
 * Remote (GitHub-backed) board — a card *is* a GitHub issue, a column is a `board:<id>:status:<col>`
 * label (the id prefix is what lets several boards share one repo without their labels colliding),
 * and the board/column structure lives in `.git-manager/board.json`, committed to the repo like any
 * other file (see `useBoardConfigAutoSync` for the optional periodic commit+push).
 *
 * **Native GitHub features first.** Every card field that GitHub has a home for uses it, so the board
 * and github.com show the same thing rather than the app hiding state in a private encoding:
 * assignee is the issue's own assignee, tags/priority/blocking are real labels, comments are real
 * issue comments, and the Definition of Done is a markdown task list in the body. Only a due date and
 * a blocking *reason* have nowhere native to go — those two live in the body's hidden metadata
 * marker (see `cardBodyMarkdown.ts`), and that is the whole of the app-private surface.
 *
 * The implementation is in three files, split where the backend's own dependencies already split it:
 * `remoteBoardContext.ts` holds what both halves must agree on, `remoteBoardOps.ts` the board-level
 * methods (the config file's CRUD), `remoteCardOps.ts` the card-level ones (everything that reaches
 * an issue). Label arithmetic and the read mapping stay in `remoteCardMapping.ts`, pure and tested.
 */
export function createRemoteBoardBackend(
  owner: string,
  repo: string,
  accountId: string
): BoardBackend {
  const ctx = createRemoteBoardContext(owner, repo, accountId)
  const boardOps = createBoardOps(ctx)
  // Only `getBoard` crosses: `setCardsArchived` needs the board *with its cards*, which is a
  // board-level read. Passing the one method keeps the two files acyclic.
  const cardOps = createCardOps(ctx, { getBoard: boardOps.getBoard })

  /**
   * Two outcomes, mirroring the local backend's — see `BoardBackend.deleteBoard`.
   *
   * `deleteCards` closes every issue on the board and then drops the board from the config. The
   * closing happens **first**, deliberately: the config is how the cards are *found*, so a failure
   * after it was rewritten would leave issues open with nothing left pointing at them.
   *
   * Otherwise the board is tombstoned: the cards are archived — which here means gaining the
   * `archived` label — and the board **stays in the config** with `deletedAt` set. Keeping it is
   * the whole point: the board's entry is what defines the `board:<id>:status:<column>` labels
   * those issues still carry, so removing it would strand them on a board id that resolves to
   * nothing.
   */
  const deleteBoard: BoardBackend['deleteBoard'] = async (path, boardId, deleteCards) => {
    const { board, cards } = await boardOps.getBoard(path, boardId)

    if (deleteCards) {
      await cardOps.deleteCards(
        path,
        boardId,
        cards.map((c) => c.id)
      )
      const config = await readConfigFile(path)
      await writeConfigFile(path, { boards: config.boards.filter((b) => b.id !== boardId) })
      return
    }

    await cardOps.setCardsArchived(
      path,
      boardId,
      cards.map((c) => c.id),
      true
    )
    await ctx.patchBoardInConfig(path, boardId, board.revision, (b) => ({
      ...b,
      deletedAt: new Date().toISOString(),
    }))
  }

  return { ...boardOps, ...cardOps, deleteBoard }
}

/** A card's discussion — fetched on demand, not with the board (see `fetchIssueComments`). */
export async function fetchRemoteCardComments(
  owner: string,
  repo: string,
  accountId: string,
  cardId: string
): Promise<BoardComment[]> {
  const comments = await fetchIssueComments(owner, repo, Number(cardId), accountId)
  return comments.map((c) => ({
    id: String(c.id),
    author: c.user?.login ?? 'unknown',
    body: c.body ?? '',
    createdAt: c.created_at,
  }))
}

/**
 * "Add to board" (issue → card), remote board case: an existing GitHub issue becomes a card just by
 * labeling it — unlike `BoardBackend.createCard`, no new issue is created. Not part of the
 * `BoardBackend` interface since it has no local-board equivalent (there, "add to board" copies the
 * issue's title/body into a brand-new local card instead — see `useBoardData.addIssueToBoard`).
 */
export async function addExistingIssueToColumn(
  owner: string,
  repo: string,
  accountId: string,
  boardId: string,
  issueNumber: number,
  columnId: string
): Promise<void> {
  await addLabels(owner, repo, issueNumber, [boardColumnLabel(boardId, columnId)], accountId)
}

export { BLOCKED_LABEL, BLOCKED_LABEL_COLOR, PRIORITY_LABELS }
export type { Board }
