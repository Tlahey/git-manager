import type { Board, BoardCard, BoardWithCards } from '@git-manager/git-types'
import { boardConflictError } from './boardConflict'
import { defaultColumns } from '../lib/boardDefaults'
import type { BoardBackend } from './boardBackend'

/**
 * A GitHub-Issues board with nowhere to send a request — the fixture double for
 * {@link createRemoteBoardBackend} (`remote-board.api.ts`), used only when `VITE_MOCK_GITHUB` is on
 * and the repository has no real connected account (see `useBoardBackends.ts`).
 *
 * The real remote backend cannot be exercised by the e2e suite at all: every one of its methods is a
 * `github_api_request` Tauri call, and this Tauri build cannot intercept an `invoke()` the *app's own*
 * click triggers — `browser.tauri.mock` only reaches a command called directly through the test
 * bridge (see `apps/e2e/README.md`'s "Mocking real Tauri commands" section). Hitting the real,
 * anonymous GitHub API from a docs-generation run was ruled out too: rate-limited, non-deterministic,
 * and the one outbound network dependency the whole suite is built to avoid. So this board is
 * offered to the UI as a `source: 'remote'` board precisely as far as an e2e run can see: same
 * dialog, same fields, same "GitHub" badge — reads and writes just never leave this module.
 *
 * Kept in memory only, and keyed by repository path — a page reload starts over, the same as every
 * other dev fixture (`lib/devFixtures/index.ts`), and switching repositories never shows one
 * repository's fixture board in another's, the way a single shared list would. Nothing here reaches
 * `localStorage` or a real repository's own git history, which is the local backend's job.
 */

interface MockBoardEntry {
  board: Board
  cards: Map<string, BoardCard>
}

/** One board map per repository path — see the module doc comment for why a single shared map is
 * wrong here, unlike the id counters below (a fixture id colliding across repositories has no
 * observable effect, so there is nothing to gain from scoping those too). */
const repos = new Map<string, Map<string, MockBoardEntry>>()
let boardCounter = 0
let cardCounter = 0
let revisionCounter = 0

function boardsFor(path: string): Map<string, MockBoardEntry> {
  let boards = repos.get(path)
  if (!boards) {
    boards = new Map()
    repos.set(path, boards)
  }
  return boards
}

function nowIso(): string {
  return new Date().toISOString()
}

/** A monotonic stand-in for the real backends' revision (a commit oid locally, an issue's
 * `updated_at` remotely) — a wall-clock timestamp has millisecond resolution, and two writes to the
 * same card in one test, or one fast click, can land in the same millisecond and make a stale write
 * look current. */
function nextRevision(): string {
  revisionCounter += 1
  return String(revisionCounter)
}

function requireEntry(path: string, boardId: string): MockBoardEntry {
  const entry = boardsFor(path).get(boardId)
  if (!entry) throw new Error(`Mock GitHub board not found: ${boardId}`)
  return entry
}

function requireCard(entry: MockBoardEntry, cardId: string): BoardCard {
  const card = entry.cards.get(cardId)
  if (!card) throw new Error(`Mock GitHub card not found: ${cardId}`)
  return card
}

function toDetail(entry: MockBoardEntry): BoardWithCards {
  return { board: entry.board, cards: [...entry.cards.values()].sort((a, b) => a.order - b.order) }
}

/** Resets every mock board, in every repository — for tests only, so one scenario's boards don't
 * leak into the next. */
export function resetMockRemoteBoards(): void {
  repos.clear()
  boardCounter = 0
  cardCounter = 0
  revisionCounter = 0
}

export const mockRemoteBoardBackend: BoardBackend = {
  listBoards: async (path) => [...boardsFor(path).values()].map((entry) => entry.board),

  getBoard: async (path, boardId) => toDetail(requireEntry(path, boardId)),

  createBoard: async (path, name, columns, dodTemplate, cardPrefix, iteration) => {
    boardCounter += 1
    const now = nowIso()
    const board: Board = {
      id: `mock-github-board-${boardCounter}`,
      name,
      source: 'remote',
      columns: columns.length > 0 ? columns : defaultColumns(),
      revision: nextRevision(),
      tags: [],
      cardPrefixes: cardPrefix.trim() ? [cardPrefix.trim().toUpperCase()] : [],
      nextCardNumbers: {},
      dodTemplate,
      iteration,
      schemaVersion: 2,
      createdAt: now,
      updatedAt: now,
    }
    boardsFor(path).set(board.id, { board, cards: new Map() })
    return board
  },

  updateBoardColumns: async (path, boardId, columns, expectedRevision) => {
    const entry = requireEntry(path, boardId)
    if (entry.board.revision !== expectedRevision) {
      throw boardConflictError('This board changed since it was last read')
    }
    entry.board = { ...entry.board, columns, revision: nextRevision(), updatedAt: nowIso() }
    return entry.board
  },

  updateBoardMeta: async (
    path,
    boardId,
    name,
    tags,
    dodTemplate,
    cardPrefixes,
    expectedRevision
  ) => {
    const entry = requireEntry(path, boardId)
    if (entry.board.revision !== expectedRevision) {
      throw boardConflictError('This board changed since it was last read')
    }
    entry.board = {
      ...entry.board,
      name,
      tags,
      dodTemplate,
      cardPrefixes: cardPrefixes
        .map((prefix) => prefix.trim().toUpperCase())
        .filter((prefix, i, all) => prefix !== '' && all.indexOf(prefix) === i),
      revision: nextRevision(),
      updatedAt: nowIso(),
    }
    return entry.board
  },

  closeBoard: async (path, boardId, summary, expectedRevision) => {
    const entry = requireEntry(path, boardId)
    if (entry.board.revision !== expectedRevision) {
      throw boardConflictError('This board changed since it was last read')
    }
    entry.board = {
      ...entry.board,
      closedAt: summary.closedAt,
      summary,
      revision: nextRevision(),
      updatedAt: nowIso(),
    }
    return entry.board
  },

  // Mirrors the real remote backend: `deleteCards` closes every card first (here, drops it), then
  // the board itself is either dropped (cards deleted with it) or tombstoned with its cards left
  // behind — see `remote-board.api.ts`'s own `deleteBoard` for why the closing has to come first
  // there. Order doesn't matter for an in-memory map, so it's kept only for the same reading order.
  deleteBoard: async (path, boardId, deleteCards) => {
    const entry = requireEntry(path, boardId)
    if (deleteCards) {
      boardsFor(path).delete(boardId)
      return
    }
    for (const card of entry.cards.values()) {
      entry.cards.set(card.id, { ...card, archivedAt: card.archivedAt ?? nowIso() })
    }
    entry.board = { ...entry.board, deletedAt: nowIso(), updatedAt: nowIso() }
  },

  createCard: async (path, boardId, columnId, card) => {
    const entry = requireEntry(path, boardId)
    cardCounter += 1
    const prefix = card.prefix?.trim().toUpperCase() ?? ''
    if (prefix && !entry.board.cardPrefixes.includes(prefix)) {
      entry.board = { ...entry.board, cardPrefixes: [...entry.board.cardPrefixes, prefix] }
    }
    const now = nowIso()
    const created: BoardCard = {
      id: `mock-github-card-${cardCounter}`,
      boardId,
      columnId,
      title: card.title,
      description: card.description ?? '',
      order: entry.cards.size,
      revision: nextRevision(),
      prefix,
      // Stands in for the issue number GitHub would allocate — sequential is all a fixture needs.
      number: cardCounter,
      kind: card.kind ?? 'task',
      links: [],
      sourceIssue: card.sourceIssue,
      assignee: undefined,
      priority: 'normal',
      tagIds: [],
      dod: entry.board.dodTemplate,
      comments: [],
      schemaVersion: 2,
      updatedAt: now,
    }
    entry.cards.set(created.id, created)
    return created
  },

  updateCard: async (path, boardId, cardId, patch, expectedRevision) => {
    const entry = requireEntry(path, boardId)
    const current = requireCard(entry, cardId)
    if (current.revision !== expectedRevision) {
      throw boardConflictError('This card changed since it was last read')
    }
    const next: BoardCard = {
      ...current,
      title: patch.title ?? current.title,
      description: patch.description ?? current.description,
      columnId: patch.columnId ?? current.columnId,
      order: patch.order ?? current.order,
      dod: patch.dod ?? current.dod,
      priority: patch.priority ?? current.priority,
      tagIds: patch.tagIds ?? current.tagIds,
      kind: patch.kind ?? current.kind,
      links: patch.links ?? current.links,
      linkedBranch:
        patch.linkedBranch === undefined ? current.linkedBranch : (patch.linkedBranch ?? undefined),
      linkedWorktreePath:
        patch.linkedWorktreePath === undefined
          ? current.linkedWorktreePath
          : (patch.linkedWorktreePath ?? undefined),
      assignee: patch.assignee === undefined ? current.assignee : (patch.assignee ?? undefined),
      dueDate: patch.dueDate === undefined ? current.dueDate : (patch.dueDate ?? undefined),
      blockedReason:
        patch.blockedReason === undefined
          ? current.blockedReason
          : (patch.blockedReason ?? undefined),
      archivedAt:
        patch.archivedAt === undefined ? current.archivedAt : (patch.archivedAt ?? undefined),
      sourceIssue:
        patch.sourceIssue === undefined ? current.sourceIssue : (patch.sourceIssue ?? undefined),
      revision: nextRevision(),
      updatedAt: nowIso(),
    }
    entry.cards.set(cardId, next)
    return next
  },

  addComment: async (path, boardId, cardId, body, _parentCommentId, expectedRevision) => {
    const entry = requireEntry(path, boardId)
    const current = requireCard(entry, cardId)
    if (current.revision !== expectedRevision) {
      throw boardConflictError('This card changed since it was last read')
    }
    // Real issue comments carry no reply concept, so `parentCommentId` is accepted and ignored here
    // too — see `BoardBackend.addComment`'s own doc comment.
    const next: BoardCard = {
      ...current,
      comments: [
        ...current.comments,
        {
          id: `mock-github-comment-${current.comments.length + 1}`,
          author: 'You',
          body,
          createdAt: nowIso(),
        },
      ],
      revision: nextRevision(),
      updatedAt: nowIso(),
    }
    entry.cards.set(cardId, next)
    return next
  },

  moveCard: async (path, boardId, cardId, columnId, order, expectedRevision) =>
    mockRemoteBoardBackend.updateCard(path, boardId, cardId, { columnId, order }, expectedRevision),

  moveCardsToBoard: async (path, fromBoardId, toBoardId, cardIds, toColumnId) => {
    const from = requireEntry(path, fromBoardId)
    const to = requireEntry(path, toBoardId)
    const fallback = [...to.board.columns].sort((a, b) => a.order - b.order)[0]
    if (!fallback) throw new Error('The destination board has no columns')
    for (const cardId of cardIds) {
      const card = from.cards.get(cardId)
      if (!card) continue
      from.cards.delete(cardId)
      const columnId =
        toColumnId ??
        (to.board.columns.some((c) => c.id === card.columnId) ? card.columnId : fallback.id)
      to.cards.set(cardId, {
        ...card,
        boardId: toBoardId,
        columnId,
        order: to.cards.size,
        revision: nextRevision(),
        updatedAt: nowIso(),
      })
    }
  },

  deleteCard: async (path, boardId, cardId) => {
    requireEntry(path, boardId).cards.delete(cardId)
  },

  deleteCards: async (path, boardId, cardIds) => {
    const entry = requireEntry(path, boardId)
    let removed = 0
    for (const cardId of cardIds) {
      if (entry.cards.delete(cardId)) removed += 1
    }
    return removed
  },

  setCardsArchived: async (path, boardId, cardIds, archived) => {
    const entry = requireEntry(path, boardId)
    let changed = 0
    for (const cardId of cardIds) {
      const card = entry.cards.get(cardId)
      if (!card || Boolean(card.archivedAt) === archived) continue
      entry.cards.set(cardId, {
        ...card,
        archivedAt: archived ? nowIso() : undefined,
        revision: nextRevision(),
        updatedAt: nowIso(),
      })
      changed += 1
    }
    return changed
  },

  assignCardIdentifiers: async (path, boardId, prefix) => {
    const normalized = prefix.trim().toUpperCase()
    if (!normalized) return 0
    const entry = requireEntry(path, boardId)
    if (!entry.board.cardPrefixes.includes(normalized)) {
      entry.board = { ...entry.board, cardPrefixes: [...entry.board.cardPrefixes, normalized] }
    }
    let numbered = 0
    for (const card of entry.cards.values()) {
      if (card.prefix) continue
      entry.cards.set(card.id, { ...card, prefix: normalized, updatedAt: nowIso() })
      numbered += 1
    }
    return numbered
  },
}
