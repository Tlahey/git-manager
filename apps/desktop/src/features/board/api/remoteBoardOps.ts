import type { Board, BoardCard } from '@git-manager/git-types'
import type { BoardBackend } from './boardBackend'
import { fetchRepoIssues } from '../../../api/github/github-issues.api'
import { createOrUpdateLabel } from '../../../api/github/github-labels.api'
import { cardFromIssue } from './remoteCardMapping'
import { readConfigFile, writeConfigFile, generateBoardId } from './remoteBoardConfigFile'
import type { RemoteBoardContext } from './remoteBoardContext'

/**
 * The board-level half of the remote backend: everything that reads or rewrites
 * `.git-manager/board.json`, plus the one read that has to reach GitHub because a board's cards
 * *are* issues.
 *
 * `deleteBoard` is deliberately not here. It is the one method that drives both halves — closing or
 * archiving every card, then rewriting the config — so it lives in the assembly layer that has both
 * (see `remote-board.api.ts`). Putting it on either side would make the two files mutually
 * dependent for a single method.
 */
export type RemoteBoardOps = Pick<
  BoardBackend,
  | 'listBoards'
  | 'getBoard'
  | 'createBoard'
  | 'updateBoardColumns'
  | 'updateBoardMeta'
  | 'closeBoard'
>

export function createBoardOps(ctx: RemoteBoardContext): RemoteBoardOps {
  const { owner, repo, accountId, loadBoard, patchBoardInConfig } = ctx

  return {
    listBoards: async (path) => (await readConfigFile(path)).boards,

    getBoard: async (path, boardId) => {
      const board = await loadBoard(path, boardId)
      const issues = await fetchRepoIssues(owner, repo, accountId)
      const cards: BoardCard[] = []
      for (const issue of issues) {
        const card = cardFromIssue(board, {
          number: issue.number,
          title: issue.title,
          body: issue.body ?? '',
          updatedAt: issue.updatedAt.toISOString(),
          labels: issue.labels,
          assignees: issue.assignees.map((a) => a.login),
          commentCount: issue.comments,
        })
        if (card) cards.push(card)
      }
      return { board, cards }
    },

    createBoard: async (path, name, columns, dodTemplate, cardPrefix, iteration) => {
      const config = await readConfigFile(path)
      const now = new Date().toISOString()
      const board: Board = {
        id: generateBoardId(),
        name,
        source: 'remote',
        columns,
        revision: now,
        tags: [],
        cardPrefixes: cardPrefix.trim() ? [cardPrefix.trim().toUpperCase()] : [],
        // Never read on this backend — a card's *number* is the issue number, which GitHub
        // allocates. The prefixes above are still offered, since the ticket identifier is the
        // card's own and independent of the issue's number.
        nextCardNumbers: {},
        dodTemplate,
        iteration,
        schemaVersion: 2,
        createdAt: now,
        updatedAt: now,
      }
      await writeConfigFile(path, { boards: [...config.boards, board] })
      return board
    },

    updateBoardColumns: (path, boardId, columns, expectedRevision) =>
      patchBoardInConfig(path, boardId, expectedRevision, (board) => ({ ...board, columns })),

    updateBoardMeta: async (
      path,
      boardId,
      name,
      tags,
      dodTemplate,
      cardPrefixes,
      expectedRevision
    ) => {
      // The tag palette *is* the repo's label set here, so colours are pushed to GitHub before the
      // config is rewritten — otherwise a tag would show the user's colour in-app and a random one
      // on github.com.
      for (const tag of tags) {
        await createOrUpdateLabel(owner, repo, tag.name, tag.color, accountId)
      }
      return patchBoardInConfig(path, boardId, expectedRevision, (board) => ({
        ...board,
        name,
        tags,
        dodTemplate,
        cardPrefixes: cardPrefixes
          .map((prefix: string) => prefix.trim().toUpperCase())
          .filter(
            (prefix: string, i: number, all: string[]) => prefix !== '' && all.indexOf(prefix) === i
          ),
      }))
    },

    closeBoard: (path, boardId, summary, expectedRevision) =>
      patchBoardInConfig(path, boardId, expectedRevision, (board) => ({
        ...board,
        closedAt: summary.closedAt,
        summary,
      })),
  }
}
