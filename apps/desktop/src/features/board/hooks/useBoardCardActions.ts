import { toast } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type {
  Board,
  BoardCard,
  BoardCardKind,
  BoardCardPatch,
  BoardCardSourceIssue,
  BoardSource,
} from '@git-manager/git-types'
import { createIssueComment } from '../../../api/github.api'
import { pushCardToIssue } from '../api/trackedIssue.api'
import { applyCardPatch, splitPatch } from '../api/trackedIssueMapping'
import { isBoardConflict } from '../api/boardConflict'
import { localBoardBackend } from '../api/local-board.api'
import type { BoardBackend } from '../api/boardBackend'
import type { BoardDetail } from './useBoardDetail'

interface BoardCardActionsDeps {
  repoPath: string
  activeBoard: Board | null
  /** Every board of the repo — the destinations `moveCardToBoard` resolves against. */
  boards: Board[]
  detail: BoardDetail
  backendFor: (source: BoardSource) => BoardBackend
  remoteBackend: BoardBackend | null
  revalidateLists: () => void
  /** The issue a card follows, or `null` — see `useCardIssueTracking`. */
  trackedRef: (card: BoardCard) => BoardCardSourceIssue | null
  token: string | null
}

/**
 * The writes that act on a **card**.
 *
 * Mutations are await-then-revalidate rather than optimistic — correct and simple beats a
 * flicker-free write for v1 — with `moveCard` the one deliberate exception, for the reason stated on
 * it.
 */
export function useBoardCardActions({
  repoPath,
  activeBoard,
  boards,
  detail,
  backendFor,
  remoteBackend,
  revalidateLists,
  trackedRef,
  token,
}: BoardCardActionsDeps) {
  const { t } = useTranslation('board')
  const { boardDetail, mutateDetail, withConflictToast } = detail

  /** `prefix` picks which identifier sequence the new card draws its number from; `kind` is what
   * sort of work it stands for. Both are chosen at creation — see `BoardCardDialog`'s create mode. */
  async function createCard(
    columnId: string,
    title: string,
    description: string,
    prefix = '',
    kind: BoardCardKind = 'task'
  ): Promise<BoardCard | undefined> {
    if (!activeBoard) return undefined
    const card = await backendFor(activeBoard.source).createCard(repoPath, activeBoard.id, columnId, {
      title,
      description,
      prefix,
      kind,
    })
    // The board itself moves on a create — the identifier counter advances, and a prefix used for
    // the first time joins the board's list — so the *list* is stale too, not just the cards. That
    // list is where the next create dialog reads its prefixes from.
    revalidateLists()
    void mutateDetail()
    return card
  }

  /**
   * Patches a card, sending the fields GitHub owns to the tracked issue first.
   *
   * **The issue is written before the local store, deliberately.** The local card is a cache of the
   * issue, so if the GitHub call fails, nothing has changed on either side and the error surfaces;
   * the other order would leave a card showing an edit its issue never received, silently reverted at
   * the next load. The local write then still carries the *whole* patch, issue-owned fields included,
   * so the cache is right immediately rather than only after the next fetch.
   */
  async function updateCard(card: BoardCard, patch: BoardCardPatch): Promise<BoardCard | null> {
    if (!activeBoard) return null

    const ref = trackedRef(card)
    if (ref) {
      const { issuePatch } = splitPatch(patch)
      if (Object.keys(issuePatch).length > 0) {
        await pushCardToIssue(boardDetail?.board ?? activeBoard, applyCardPatch(card, patch), ref, token!)
      }
    }

    const result = await withConflictToast(() =>
      backendFor(activeBoard.source).updateCard(repoPath, activeBoard.id, card.id, patch, card.revision)
    )
    if (result) void mutateDetail()
    return result
  }

  /** Stops following the issue. The card keeps everything the issue had put on it and becomes an
   * ordinary local card — severing the link is not a reason to lose the content. */
  async function untrackCard(card: BoardCard): Promise<BoardCard | null> {
    return updateCard(card, { sourceIssue: null })
  }

  /**
   * Moves a card, **optimistically**.
   *
   * This one mutation cannot be await-then-revalidate like the rest: a drag ends by dropping the card
   * wherever the data says it belongs, so waiting for the round trip makes it visibly snap back to
   * where it came from and then jump to the new column a moment later. The reposition is applied to
   * the cache the instant the card is released, and rolled back if the write fails.
   */
  async function moveCard(card: BoardCard, columnId: string, order: number): Promise<void> {
    // `boardDetail` is the base the optimistic copy is built from; a drag cannot start before the
    // cards it drags are on screen, so this guard never fires in practice.
    if (!activeBoard || !boardDetail) return
    const backend = backendFor(activeBoard.source)

    try {
      await mutateDetail(
        async () => {
          await backend.moveCard(repoPath, activeBoard.id, card.id, columnId, order, card.revision)
          return backend.getBoard(repoPath, activeBoard.id)
        },
        {
          optimisticData: (current) => {
            const base = current ?? boardDetail
            return {
              ...base,
              cards: base.cards.map((c) => (c.id === card.id ? { ...c, columnId, order } : c)),
            }
          },
          rollbackOnError: true,
          revalidate: false,
        }
      )
    } catch (error) {
      if (isBoardConflict(error)) {
        toast.error(t('conflict.message'))
        await mutateDetail()
        return
      }
      throw error
    }
  }

  async function deleteCard(card: BoardCard): Promise<void> {
    if (!activeBoard) return
    await backendFor(activeBoard.source).deleteCard(repoPath, activeBoard.id, card.id)
    void mutateDetail()
  }

  /**
   * Copies a card into the same column, right after the original.
   *
   * Everything the card *is* travels: description, checklist, assignee, priority, due date, tags,
   * blocking. Its **comments do not** — a discussion happened on one card, and reproducing it under
   * a new one would attribute words to a conversation that never took place there. The linked branch
   * is dropped for the same kind of reason: two cards pointing at one branch is not a copy, it's an
   * ambiguity.
   */
  async function duplicateCard(card: BoardCard): Promise<BoardCard | null> {
    if (!activeBoard) return null
    const backend = backendFor(activeBoard.source)
    const copy = await backend.createCard(repoPath, activeBoard.id, card.columnId, {
      title: t('card.duplicateTitle', { title: card.title }),
      description: card.description,
      // A copy is the same *kind* of work under the same sequence, but it is a new ticket and
      // takes the next number of its own.
      prefix: card.prefix,
      kind: card.kind,
    })
    const patched = await backend.updateCard(
      repoPath,
      activeBoard.id,
      copy.id,
      {
        assignee: card.assignee ?? null,
        priority: card.priority,
        dueDate: card.dueDate ?? null,
        tagIds: card.tagIds,
        blockedReason: card.blockedReason ?? null,
        dod: card.dod,
      },
      copy.revision
    )
    void mutateDetail()
    return patched
  }

  async function addComment(card: BoardCard, body: string): Promise<BoardCard | null> {
    if (!activeBoard || !body.trim()) return null

    // A tracked card's discussion belongs to its issue: a comment written here has to be the same
    // comment someone reads on github.com, or the two threads quietly diverge.
    const ref = trackedRef(card)
    if (ref) {
      await createIssueComment(ref.owner, ref.repo, ref.number, body.trim(), token!)
      void mutateDetail()
      return card
    }

    const result = await withConflictToast(() =>
      backendFor(activeBoard.source).addComment(
        repoPath,
        activeBoard.id,
        card.id,
        body.trim(),
        card.revision
      )
    )
    if (result) void mutateDetail()
    return result
  }

  /**
   * Moves a card to another board — including onto GitHub, which is what "convert to issue" used to
   * be its own action for.
   *
   * Two mechanisms, picked from the two boards' `source`:
   *
   * - **Same backend.** The backend moves it: the card keeps its id, its comments and its history,
   *   and on GitHub the issue is simply relabelled rather than reopened somewhere else.
   * - **Local → GitHub.** There is nothing to relabel, so the issue is *created* and the local card
   *   removed. Everything the issue can hold travels with it in a follow-up patch — a move that
   *   silently dropped the card's priority, deadline and checklist would be a move in name only. Its
   *   comments do not: they were written by people on a card, and re-posting them under the app's
   *   token would attribute them to whoever moved it.
   *
   * The reverse direction is refused rather than half-implemented — see `cardMoveTargets.ts`, which
   * is what keeps it out of the picker in the first place.
   *
   * A **tracked** card is refused the GitHub direction outright. It already stands for an issue, so
   * the create path would produce a second issue copying the first, leave the original open, and
   * then delete the only card that linked them. The refusal is repeated here rather than left to the
   * picker because the picker isn't the only way in — the same reason `addIssueToBoard` re-checks
   * for a duplicate it has already greyed out.
   */
  async function moveCardToBoard(
    card: BoardCard,
    targetBoardId: string,
    targetColumnId: string
  ): Promise<void> {
    if (!activeBoard) return
    const target = boards.find((b) => b.id === targetBoardId)
    if (!target) throw new Error(`Board not found: ${targetBoardId}`)
    if (card.sourceIssue && target.source === 'remote') {
      throw new Error('A card tracking an issue cannot be moved onto a GitHub board')
    }

    if (target.source === activeBoard.source) {
      await backendFor(target.source).moveCardsToBoard(
        repoPath,
        card.boardId,
        targetBoardId,
        [card.id],
        targetColumnId
      )
    } else if (activeBoard.source === 'local' && target.source === 'remote') {
      if (!remoteBackend) throw new Error('This repository has no connected GitHub account')
      const created = await remoteBackend.createCard(repoPath, targetBoardId, targetColumnId, {
        title: card.title,
        description: card.description,
        prefix: card.prefix,
        kind: card.kind,
      })
      await remoteBackend.updateCard(
        repoPath,
        targetBoardId,
        created.id,
        {
          assignee: card.assignee ?? null,
          priority: card.priority,
          dueDate: card.dueDate ?? null,
          tagIds: card.tagIds,
          blockedReason: card.blockedReason ?? null,
          linkedBranch: card.linkedBranch ?? null,
          dod: card.dod,
          links: card.links,
        },
        created.revision
      )
      // Last, so a failure anywhere above leaves the card where it was rather than nowhere.
      await localBoardBackend.deleteCard(repoPath, card.boardId, card.id)
    } else {
      throw new Error('A GitHub card cannot be moved to a local board')
    }

    revalidateLists()
    void mutateDetail()
  }

  return {
    createCard,
    updateCard,
    untrackCard,
    moveCard,
    moveCardToBoard,
    deleteCard,
    duplicateCard,
    addComment,
  }
}
