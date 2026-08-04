import type { Board, BoardCard, BoardComment } from '@git-manager/git-types'
import { readBoardConfig, writeBoardConfig } from '../../lib/tauri'
import {
  fetchRepoIssues,
  fetchIssueDetail,
  createIssue,
  updateIssue,
  setIssueState,
  fetchIssueComments,
  createIssueComment,
  type GhRawIssue,
} from '../github/github-issues.api'
import {
  addLabels,
  removeLabel,
  addAssignees,
  removeAssignees,
  createOrUpdateLabel,
} from '../github/github-labels.api'
import { composeCardBody, parseCardBody } from './cardBodyMarkdown'
import {
  BLOCKED_LABEL,
  BLOCKED_LABEL_COLOR,
  PRIORITY_LABELS,
  boardColumnLabel,
  boardLabelPrefix,
  cardFromIssue,
  managedLabelsFor,
  KIND_LABELS,
  reconcileLabels,
  type RawIssueForCard,
} from './remoteCardMapping'
import type { BoardBackend } from './boardBackend'

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
 * Label arithmetic and the read mapping are in `remoteCardMapping.ts`, kept pure and tested.
 */

interface RemoteBoardConfigFile {
  boards: Board[]
}

async function readConfigFile(path: string): Promise<RemoteBoardConfigFile> {
  const raw = await readBoardConfig(path)
  if (!raw) return { boards: [] }
  try {
    const parsed: unknown = JSON.parse(raw)
    const boards = (parsed as Partial<RemoteBoardConfigFile> | null)?.boards
    // Boards written before tags/DOD templates existed lack those keys; default them on read so the
    // rest of the app can treat every board as the current shape.
    return {
      boards: Array.isArray(boards)
        ? boards.map((b) => ({
            ...b,
            tags: b.tags ?? [],
            dodTemplate: b.dodTemplate ?? '',
            // A config written before per-card prefixes carries a single `cardPrefix`.
            cardPrefixes:
              b.cardPrefixes ??
              ('cardPrefix' in b && b.cardPrefix ? [String(b.cardPrefix)] : []),
            nextCardNumbers: b.nextCardNumbers ?? {},
          }))
        : [],
    }
  } catch {
    return { boards: [] }
  }
}

async function writeConfigFile(path: string, config: RemoteBoardConfigFile): Promise<void> {
  await writeBoardConfig(path, JSON.stringify(config, null, 2))
}

/** Short, label-safe id — no uuid dependency, mirrors `git_board.rs`'s dependency-free id
 * generation. Must stay short: it's embedded in every card's label (`board:<id>:status:<col>`),
 * which has to fit under GitHub's 50-character label limit alongside the column id. */
function generateBoardId(): string {
  let hash = 0
  const seed = `${Date.now()}-${Math.random()}`
  for (let i = 0; i < seed.length; i++) {
    hash = (Math.imul(31, hash) + seed.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(16)
}

function boardConflictError(message: string): Error {
  return Object.assign(new Error(message), { code: 'BOARD_CONFLICT' })
}

function rawToIssueForCard(raw: GhRawIssue): RawIssueForCard {
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

export function createRemoteBoardBackend(owner: string, repo: string, token: string): BoardBackend {
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
      await removeLabel(owner, repo, Number(card.id), label, token)
    }
    if (toAdd.length > 0) {
      await addLabels(owner, repo, Number(card.id), toAdd, token)
    }
  }

  /** Assignee is single here, so writing one means clearing whoever held it before. */
  async function syncAssignee(
    issueNumber: number,
    current: string[],
    next: string | undefined
  ): Promise<void> {
    const stale = current.filter((login) => login !== next)
    if (stale.length > 0) await removeAssignees(owner, repo, issueNumber, stale, token)
    if (next && !current.includes(next)) {
      await addAssignees(owner, repo, issueNumber, [next], token)
    }
  }

  async function readCard(board: Board, issueNumber: number): Promise<BoardCard> {
    const raw = await fetchIssueDetail(owner, repo, issueNumber, token)
    const card = cardFromIssue(board, rawToIssueForCard(raw))
    if (!card) throw new Error('Card no longer carries a column label for this board')
    return card
  }

  async function updateCard(
    path: string,
    boardId: string,
    cardId: string,
    patch: Parameters<BoardBackend['updateCard']>[3],
    expectedRevision: string
  ): Promise<BoardCard> {
    const board = await loadBoard(path, boardId)
    const issueNumber = Number(cardId)
    const raw = await fetchIssueDetail(owner, repo, issueNumber, token)
    if (raw.updated_at !== expectedRevision) {
      throw boardConflictError('This card changed since it was last read')
    }

    const current = cardFromIssue(board, rawToIssueForCard(raw))
    if (!current) throw new Error('Card no longer carries a column label for this board')

    // `undefined` means "leave unchanged"; `null` on a nullable field means "clear it".
    const next: BoardCard = {
      ...current,
      title: patch.title ?? current.title,
      description: patch.description ?? current.description,
      columnId: patch.columnId ?? current.columnId,
      dod: patch.dod ?? current.dod,
      priority: patch.priority ?? current.priority,
      tagIds: patch.tagIds ?? current.tagIds,
      linkedBranch:
        patch.linkedBranch === undefined ? current.linkedBranch : (patch.linkedBranch ?? undefined),
      assignee: patch.assignee === undefined ? current.assignee : (patch.assignee ?? undefined),
      dueDate: patch.dueDate === undefined ? current.dueDate : (patch.dueDate ?? undefined),
      blockedReason:
        patch.blockedReason === undefined
          ? current.blockedReason
          : (patch.blockedReason?.trim() || undefined),
    }

    const body = composeCardBody({
      description: next.description,
      dod: next.dod,
      meta: {
        dueDate: next.dueDate,
        blockedReason: next.blockedReason,
        linkedBranch: next.linkedBranch,
      },
    })
    const existingBody = parseCardBody(raw.body ?? '')
    const bodyChanged =
      body !== composeCardBody({ ...existingBody, description: existingBody.description })
    if (next.title !== current.title || bodyChanged) {
      await updateIssue(owner, repo, issueNumber, { title: next.title, body }, token)
    }

    await syncLabels(board, next, (raw.labels ?? []).map((l) => l.name))
    if (patch.assignee !== undefined) {
      await syncAssignee(issueNumber, (raw.assignees ?? []).map((a) => a.login), next.assignee)
    }

    return readCard(board, issueNumber)
  }

  return {
    listBoards: async (path) => (await readConfigFile(path)).boards,

    getBoard: async (path, boardId) => {
      const board = await loadBoard(path, boardId)
      const issues = await fetchRepoIssues(owner, repo, token)
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

    createBoard: async (path, name, columns, dodTemplate, cardPrefix) => {
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
        schemaVersion: 2,
        createdAt: now,
        updatedAt: now,
      }
      await writeConfigFile(path, { boards: [...config.boards, board] })
      return board
    },

    updateBoardColumns: (path, boardId, columns, expectedRevision) =>
      patchBoardInConfig(path, boardId, expectedRevision, (board) => ({ ...board, columns })),

    updateBoardMeta: async (path, boardId, name, tags, dodTemplate, cardPrefixes, expectedRevision) => {
      // The tag palette *is* the repo's label set here, so colours are pushed to GitHub before the
      // config is rewritten — otherwise a tag would show the user's colour in-app and a random one
      // on github.com.
      for (const tag of tags) {
        await createOrUpdateLabel(owner, repo, tag.name, tag.color, token)
      }
      return patchBoardInConfig(path, boardId, expectedRevision, (board) => ({
        ...board,
        name,
        tags,
        dodTemplate,
        cardPrefixes: cardPrefixes
          .map((prefix: string) => prefix.trim().toUpperCase())
          .filter((prefix: string, i: number, all: string[]) => prefix !== '' && all.indexOf(prefix) === i),
      }))
    },

    closeBoard: (path, boardId, summary, expectedRevision) =>
      patchBoardInConfig(path, boardId, expectedRevision, (board) => ({
        ...board,
        closedAt: summary.closedAt,
        summary,
      })),

    deleteBoard: async (path, boardId) => {
      const config = await readConfigFile(path)
      await writeConfigFile(path, { boards: config.boards.filter((b) => b.id !== boardId) })
    },

    createCard: async (path, boardId, columnId, card) => {
      const board = await loadBoard(path, boardId)
      const created = await createIssue(
        owner,
        repo,
        {
          title: card.title,
          body: composeCardBody({
            description: card.description ?? '',
            dod: board.dodTemplate,
            // The card's own prefix goes in the body: GitHub numbers the *issue*, and that number
            // is not the ticket's identifier.
            meta: { prefix: card.prefix || undefined },
          }),
        },
        token
      )
      const labels = [boardColumnLabel(boardId, columnId)]
      if (card.kind === 'bug' || card.kind === 'epic') {
        const label = KIND_LABELS[card.kind]
        await createOrUpdateLabel(owner, repo, label.name, label.color, token)
        labels.push(label.name)
      }
      await addLabels(owner, repo, created.number, labels, token)
      return readCard(board, created.number)
    },

    updateCard,

    addComment: async (path, boardId, cardId, body) => {
      const board = await loadBoard(path, boardId)
      await createIssueComment(owner, repo, Number(cardId), body, token)
      return readCard(board, Number(cardId))
    },

    moveCard: (path, boardId, cardId, columnId, _order, expectedRevision) =>
      updateCard(path, boardId, cardId, { columnId }, expectedRevision),

    /** Carry-over relabels the issues rather than copying them — a duplicated GitHub issue would be
     * a second, competing source of truth for the same work. */
    moveCardsToBoard: async (path, fromBoardId, toBoardId, cardIds) => {
      const from = await loadBoard(path, fromBoardId)
      const to = await loadBoard(path, toBoardId)
      const fallbackColumn = [...to.columns].sort((a, b) => a.order - b.order)[0]
      if (!fallbackColumn) throw new Error('The destination board has no columns')

      for (const cardId of cardIds) {
        const issueNumber = Number(cardId)
        const raw = await fetchIssueDetail(owner, repo, issueNumber, token)
        const labels = (raw.labels ?? []).map((l) => l.name)
        const oldLabel = labels.find((l) => l.startsWith(boardLabelPrefix(from.id)))
        const columnId = oldLabel ? oldLabel.slice(boardLabelPrefix(from.id).length) : null
        const targetColumn = to.columns.some((c) => c.id === columnId)
          ? (columnId as string)
          : fallbackColumn.id

        if (oldLabel) await removeLabel(owner, repo, issueNumber, oldLabel, token)
        await addLabels(owner, repo, issueNumber, [boardColumnLabel(to.id, targetColumn)], token)
      }
    },

    deleteCard: async (_path, _boardId, cardId) => {
      await setIssueState(owner, repo, Number(cardId), 'closed', token)
    },
  }
}

/** A card's discussion — fetched on demand, not with the board (see `fetchIssueComments`). */
export async function fetchRemoteCardComments(
  owner: string,
  repo: string,
  token: string,
  cardId: string
): Promise<BoardComment[]> {
  const comments = await fetchIssueComments(owner, repo, Number(cardId), token)
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
  token: string,
  boardId: string,
  issueNumber: number,
  columnId: string
): Promise<void> {
  await addLabels(owner, repo, issueNumber, [boardColumnLabel(boardId, columnId)], token)
}

export { BLOCKED_LABEL, BLOCKED_LABEL_COLOR, PRIORITY_LABELS }
