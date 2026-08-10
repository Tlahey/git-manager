import type { Board, BoardCard, BoardComment } from '@git-manager/git-types'
import {
  fetchRepoIssues,
  fetchIssueDetail,
  createIssue,
  updateIssue,
  setIssueState,
  fetchIssueComments,
  createIssueComment,
  type GhRawIssue,
} from '../../../api/github/github-issues.api'
import {
  addLabels,
  removeLabel,
  addAssignees,
  removeAssignees,
  createOrUpdateLabel,
} from '../../../api/github/github-labels.api'
import { composeCardBody, parseCardBody } from './cardBodyMarkdown'
import { boardConflictError } from './boardConflict'
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
import { readConfigFile, writeConfigFile, generateBoardId } from './remoteBoardConfigFile'

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
      kind: patch.kind ?? current.kind,
      links: patch.links ?? current.links,
      linkedBranch:
        patch.linkedBranch === undefined ? current.linkedBranch : (patch.linkedBranch ?? undefined),
      assignee: patch.assignee === undefined ? current.assignee : (patch.assignee ?? undefined),
      dueDate: patch.dueDate === undefined ? current.dueDate : (patch.dueDate ?? undefined),
      blockedReason:
        patch.blockedReason === undefined
          ? current.blockedReason
          : patch.blockedReason?.trim() || undefined,
      // Carried into `next` so `managedLabelsFor` below sees it — that reconciliation is the only
      // thing that writes the `archived` label, and leaving the field out here is precisely how this
      // backend used to accept an archive and hand the card back unarchived.
      archivedAt:
        patch.archivedAt === undefined ? current.archivedAt : (patch.archivedAt ?? undefined),
    }

    // **Every** body-borne field is recomposed, not just the ones this patch touched: the marker is
    // rewritten whole, so one left out here is one deleted from the issue the first time anything
    // else on the card is edited.
    const body = composeCardBody({
      description: next.description,
      dod: next.dod,
      meta: {
        dueDate: next.dueDate,
        blockedReason: next.blockedReason,
        linkedBranch: next.linkedBranch,
        prefix: next.prefix || undefined,
        links: next.links,
      },
    })
    const existingBody = parseCardBody(raw.body ?? '')
    const bodyChanged =
      body !== composeCardBody({ ...existingBody, description: existingBody.description })
    if (next.title !== current.title || bodyChanged) {
      await updateIssue(owner, repo, issueNumber, { title: next.title, body }, token)
    }

    await syncLabels(
      board,
      next,
      (raw.labels ?? []).map((l) => l.name)
    )
    if (patch.assignee !== undefined) {
      await syncAssignee(
        issueNumber,
        (raw.assignees ?? []).map((a) => a.login),
        next.assignee
      )
    }

    return readCard(board, issueNumber)
  }

  // Named rather than returned inline so `deleteCards` can reach `deleteCard` — one issue closed one
  // way, whether it was asked for on its own or as part of a purge.
  const backend: BoardBackend = {
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
        await createOrUpdateLabel(owner, repo, tag.name, tag.color, token)
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
    deleteBoard: async (path, boardId, deleteCards) => {
      const { board, cards } = await backend.getBoard(path, boardId)

      if (deleteCards) {
        await backend.deleteCards(
          path,
          boardId,
          cards.map((c) => c.id)
        )
        const config = await readConfigFile(path)
        await writeConfigFile(path, { boards: config.boards.filter((b) => b.id !== boardId) })
        return
      }

      await backend.setCardsArchived(
        path,
        boardId,
        cards.map((c) => c.id),
        true
      )
      await patchBoardInConfig(path, boardId, board.revision, (b) => ({
        ...b,
        deletedAt: new Date().toISOString(),
      }))
    },

    createCard: async (path, boardId, columnId, card) => {
      let board = await loadBoard(path, boardId)
      // A prefix used for the first time joins the board's list, mirroring what `git_board.rs` does
      // in the same commit as the card: the board has to offer what its cards already carry, or the
      // prefix typed at creation would be gone from the next card's picker.
      if (card.prefix && !board.cardPrefixes.includes(card.prefix)) {
        board = await patchBoardInConfig(path, boardId, board.revision, (b) => ({
          ...b,
          cardPrefixes: [...b.cardPrefixes, card.prefix!],
        }))
      }
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

    /**
     * Carry-over relabels the issues rather than copying them — a duplicated GitHub issue would be
     * a second, competing source of truth for the same work.
     *
     * `toColumnId` places every card explicitly (moving one card by hand); without it each card
     * keeps its own column where the target board has one by that id, which is what carry-over
     * wants.
     */
    moveCardsToBoard: async (path, fromBoardId, toBoardId, cardIds, toColumnId) => {
      const from = await loadBoard(path, fromBoardId)
      const to = await loadBoard(path, toBoardId)
      const fallbackColumn = [...to.columns].sort((a, b) => a.order - b.order)[0]
      if (!fallbackColumn) throw new Error('The destination board has no columns')
      if (toColumnId && !to.columns.some((c) => c.id === toColumnId)) {
        throw new Error(`The destination board has no column ${toColumnId}`)
      }

      for (const cardId of cardIds) {
        const issueNumber = Number(cardId)
        const raw = await fetchIssueDetail(owner, repo, issueNumber, token)
        const labels = (raw.labels ?? []).map((l) => l.name)
        const oldLabel = labels.find((l) => l.startsWith(boardLabelPrefix(from.id)))
        const columnId = oldLabel ? oldLabel.slice(boardLabelPrefix(from.id).length) : null
        const targetColumn =
          toColumnId ??
          (to.columns.some((c) => c.id === columnId) ? (columnId as string) : fallbackColumn.id)

        if (oldLabel) await removeLabel(owner, repo, issueNumber, oldLabel, token)
        await addLabels(owner, repo, issueNumber, [boardColumnLabel(to.id, targetColumn)], token)
      }
    },

    deleteCard: async (_path, _boardId, cardId) => {
      await setIssueState(owner, repo, Number(cardId), 'closed', token)
    },

    /**
     * There is no bulk endpoint on GitHub's side, so this is the loop the local backend gets to
     * avoid — sequential rather than concurrent, to stay within the secondary rate limit that
     * mutating calls in parallel is the documented way to trip.
     *
     * In practice this never runs: a remote card is an issue and carries no `archivedAt`, so the
     * archive list a purge is started from is always empty on a GitHub board. It is implemented
     * anyway because the contract is what stops the UI from having to know that.
     */
    deleteCards: async (path, boardId, cardIds) => {
      for (const cardId of cardIds) {
        await backend.deleteCard(path, boardId, cardId)
      }
      return cardIds.length
    },

    /**
     * Archiving is a label here — see `ARCHIVED_LABEL` — so this is a patch per card and, again, the
     * loop the local backend gets to avoid. Sequential for the same rate-limit reason as
     * `deleteCards`.
     *
     * Each card's own `revision` has to be read fresh rather than carried in from the caller: the
     * remote revision is the issue's `updated_at`, and one that came back with the board a moment ago
     * is already stale for any issue touched since. Cards already in the requested state are skipped,
     * which is also what keeps this from rewriting a whole column to change nothing.
     */
    /**
     * The number is GitHub's here, so this only has to write the missing half: the card's prefix,
     * which lives in the issue body's metadata marker (the issue number is the *issue's* identity,
     * not the ticket's — see `createCard`). A card that already carries a prefix is left alone.
     *
     * Sequential, and one `updateIssue` per card, for the same secondary-rate-limit reason as
     * `deleteCards`. The body is recomposed whole — every body-borne field goes back in, or writing
     * the prefix would delete the due date next to it.
     */
    assignCardIdentifiers: async (path, boardId, prefix) => {
      const normalized = prefix.trim().toUpperCase()
      if (!normalized) return 0
      const { cards } = await backend.getBoard(path, boardId)
      const missing = cards.filter((card) => !card.prefix)
      if (missing.length === 0) return 0

      const board = await loadBoard(path, boardId)
      if (!board.cardPrefixes.includes(normalized)) {
        await patchBoardInConfig(path, boardId, board.revision, (b) => ({
          ...b,
          cardPrefixes: [...b.cardPrefixes, normalized],
        }))
      }

      for (const card of missing) {
        await updateIssue(
          owner,
          repo,
          Number(card.id),
          {
            body: composeCardBody({
              description: card.description,
              dod: card.dod,
              meta: {
                dueDate: card.dueDate,
                blockedReason: card.blockedReason,
                linkedBranch: card.linkedBranch,
                prefix: normalized,
                links: card.links,
              },
            }),
          },
          token
        )
      }
      return missing.length
    },

    setCardsArchived: async (path, boardId, cardIds, archived) => {
      const { cards } = await backend.getBoard(path, boardId)
      const wanted = cards.filter(
        (c) => cardIds.includes(c.id) && Boolean(c.archivedAt) !== archived
      )
      for (const card of wanted) {
        await backend.updateCard(
          path,
          boardId,
          card.id,
          { archivedAt: archived ? new Date().toISOString() : null },
          card.revision
        )
      }
      return wanted.length
    },
  }

  return backend
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
