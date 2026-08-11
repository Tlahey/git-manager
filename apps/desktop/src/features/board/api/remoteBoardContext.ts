import type { Board, BoardCard } from '@git-manager/git-types'
import { fetchIssueDetail, type GhRawIssue } from '../../../api/github/github-issues.api'
import {
  addLabels,
  removeLabel,
  addAssignees,
  removeAssignees,
} from '../../../api/github/github-labels.api'
import { boardConflictError } from './boardConflict'
import {
  cardFromIssue,
  managedLabelsFor,
  reconcileLabels,
  type RawIssueForCard,
} from './remoteCardMapping'
import { readConfigFile, writeConfigFile } from './remoteBoardConfigFile'

/**
 * What the remote board's two halves — its board operations and its card operations — both need.
 *
 * The repository coordinates and the five helpers below are the whole of it. They are here rather
 * than duplicated on each side because every one of them is the *definition* of something the two
 * must agree on: what "the board" is, what a compare-and-swap on it costs, and which of an issue's
 * labels this board is allowed to touch. Two copies of `reconcileLabels`' caller would be two
 * answers to the last one.
 */

/** The shape `remoteCardMapping` reads, from GitHub's own issue payload. */
export function rawToIssueForCard(raw: GhRawIssue): RawIssueForCard {
  return {
    number: raw.number,
    title: raw.title,
    body: raw.body ?? '',
    updatedAt: raw.updated_at,
    labels: (raw.labels ?? []).map((l) => l.name),
    assignees: (raw.assignees ?? []).map((a) => a.login),
    commentCount: raw.comments,
  }
}

export interface RemoteBoardContext {
  owner: string
  repo: string
  accountId: string
  loadBoard(path: string, boardId: string): Promise<Board>
  /** Rewrites the board entry in the config file under a compare-and-swap on its `revision`. */
  patchBoardInConfig(
    path: string,
    boardId: string,
    expectedRevision: string,
    apply: (board: Board) => Board
  ): Promise<Board>
  syncLabels(board: Board, card: BoardCard, currentLabels: string[]): Promise<void>
  syncAssignee(issueNumber: number, current: string[], next: string | undefined): Promise<void>
  readCard(board: Board, issueNumber: number): Promise<BoardCard>
}

export function createRemoteBoardContext(
  owner: string,
  repo: string,
  accountId: string
): RemoteBoardContext {
  async function loadBoard(path: string, boardId: string): Promise<Board> {
    const config = await readConfigFile(path)
    const board = config.boards.find((b) => b.id === boardId)
    if (!board) throw new Error(`Board not found: ${boardId}`)
    return board
  }

  /** Rewrites the board entry in the config file under a compare-and-swap on its `revision`. */
  async function patchBoardInConfig(
    path: string,
    boardId: string,
    expectedRevision: string,
    apply: (board: Board) => Board
  ): Promise<Board> {
    const config = await readConfigFile(path)
    const idx = config.boards.findIndex((b) => b.id === boardId)
    if (idx === -1) throw new Error(`Board not found: ${boardId}`)
    if (config.boards[idx].revision !== expectedRevision) {
      throw boardConflictError('This board changed since it was last read')
    }
    const now = new Date().toISOString()
    const updated = { ...apply(config.boards[idx]), revision: now, updatedAt: now }
    const boards = [...config.boards]
    boards[idx] = updated
    await writeConfigFile(path, { boards })
    return updated
  }

  /** Moves an issue's labels towards what the card says they should be, leaving labels this board
   * doesn't own untouched. */
  async function syncLabels(board: Board, card: BoardCard, currentLabels: string[]): Promise<void> {
    const { toAdd, toRemove } = reconcileLabels(board, currentLabels, managedLabelsFor(board, card))
    for (const label of toRemove) {
      await removeLabel(owner, repo, Number(card.id), label, accountId)
    }
    if (toAdd.length > 0) {
      await addLabels(owner, repo, Number(card.id), toAdd, accountId)
    }
  }

  /** Assignee is single here, so writing one means clearing whoever held it before. */
  async function syncAssignee(
    issueNumber: number,
    current: string[],
    next: string | undefined
  ): Promise<void> {
    const stale = current.filter((login) => login !== next)
    if (stale.length > 0) await removeAssignees(owner, repo, issueNumber, stale, accountId)
    if (next && !current.includes(next)) {
      await addAssignees(owner, repo, issueNumber, [next], accountId)
    }
  }

  async function readCard(board: Board, issueNumber: number): Promise<BoardCard> {
    const raw = await fetchIssueDetail(owner, repo, issueNumber, accountId)
    const card = cardFromIssue(board, rawToIssueForCard(raw))
    if (!card) throw new Error('Card no longer carries a column label for this board')
    return card
  }
  return {
    owner,
    repo,
    accountId,
    loadBoard,
    patchBoardInConfig,
    syncLabels,
    syncAssignee,
    readCard,
  }
}
