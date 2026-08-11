import type { BoardCard } from '@git-manager/git-types'
import type { BoardBackend } from './boardBackend'
import {
  fetchIssueDetail,
  createIssue,
  updateIssue,
  setIssueState,
  createIssueComment,
} from '../../../api/github/github-issues.api'
import { addLabels, removeLabel, createOrUpdateLabel } from '../../../api/github/github-labels.api'
import { composeCardBody, parseCardBody } from './cardBodyMarkdown'
import { boardConflictError } from './boardConflict'
import { boardColumnLabel, boardLabelPrefix, cardFromIssue, KIND_LABELS } from './remoteCardMapping'
import { rawToIssueForCard, type RemoteBoardContext } from './remoteBoardContext'

/** The card-level half of the remote backend: everything that reaches a GitHub issue. */
export type RemoteCardOps = Pick<
  BoardBackend,
  | 'createCard'
  | 'updateCard'
  | 'addComment'
  | 'moveCard'
  | 'moveCardsToBoard'
  | 'deleteCard'
  | 'deleteCards'
  | 'assignCardIdentifiers'
  | 'setCardsArchived'
>

/**
 * `getBoard` is injected rather than reached for: `setCardsArchived` needs the board *with its
 * cards*, which is a board-level read, and having the card half call back into the board half
 * through a shared object would put a cycle between the two files for one method.
 */
export function createCardOps(
  ctx: RemoteBoardContext,
  deps: Pick<BoardBackend, 'getBoard'>
): RemoteCardOps {
  const {
    owner,
    repo,
    accountId,
    loadBoard,
    patchBoardInConfig,
    syncLabels,
    syncAssignee,
    readCard,
  } = ctx

  async function updateCard(
    path: string,
    boardId: string,
    cardId: string,
    patch: Parameters<BoardBackend['updateCard']>[3],
    expectedRevision: string
  ): Promise<BoardCard> {
    const board = await loadBoard(path, boardId)
    const issueNumber = Number(cardId)
    const raw = await fetchIssueDetail(owner, repo, issueNumber, accountId)
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
      await updateIssue(owner, repo, issueNumber, { title: next.title, body }, accountId)
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

  const ops: RemoteCardOps = {
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
        accountId
      )
      const labels = [boardColumnLabel(boardId, columnId)]
      if (card.kind === 'bug' || card.kind === 'epic') {
        const label = KIND_LABELS[card.kind]
        await createOrUpdateLabel(owner, repo, label.name, label.color, accountId)
        labels.push(label.name)
      }
      await addLabels(owner, repo, created.number, labels, accountId)
      return readCard(board, created.number)
    },

    updateCard,

    addComment: async (path, boardId, cardId, body) => {
      const board = await loadBoard(path, boardId)
      await createIssueComment(owner, repo, Number(cardId), body, accountId)
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
        const raw = await fetchIssueDetail(owner, repo, issueNumber, accountId)
        const labels = (raw.labels ?? []).map((l) => l.name)
        const oldLabel = labels.find((l) => l.startsWith(boardLabelPrefix(from.id)))
        const columnId = oldLabel ? oldLabel.slice(boardLabelPrefix(from.id).length) : null
        const targetColumn =
          toColumnId ??
          (to.columns.some((c) => c.id === columnId) ? (columnId as string) : fallbackColumn.id)

        if (oldLabel) await removeLabel(owner, repo, issueNumber, oldLabel, accountId)
        await addLabels(
          owner,
          repo,
          issueNumber,
          [boardColumnLabel(to.id, targetColumn)],
          accountId
        )
      }
    },

    deleteCard: async (_path, _boardId, cardId) => {
      await setIssueState(owner, repo, Number(cardId), 'closed', accountId)
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
        await ops.deleteCard(path, boardId, cardId)
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
      const { cards } = await deps.getBoard(path, boardId)
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
          accountId
        )
      }
      return missing.length
    },

    setCardsArchived: async (path, boardId, cardIds, archived) => {
      const { cards } = await deps.getBoard(path, boardId)
      const wanted = cards.filter(
        (c) => cardIds.includes(c.id) && Boolean(c.archivedAt) !== archived
      )
      for (const card of wanted) {
        await ops.updateCard(
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

  return ops
}
