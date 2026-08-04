import useSWR, { useSWRConfig } from 'swr'
import { useMemo } from 'react'
import { toast } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type {
  Board,
  BoardCard,
  BoardCardKind,
  BoardCardPatch,
  BoardColumn,
  BoardComment,
  BoardSource,
  BoardTag,
  SprintSummary,
} from '@git-manager/git-types'
import { useRepoGitHub } from './useRepoGitHub'
import { useBoardStore } from '../stores/board.store'
import { localBoardBackend } from '../api/board/local-board.api'
import {
  createRemoteBoardBackend,
  addExistingIssueToColumn,
  fetchRemoteCardComments,
} from '../api/board/remote-board.api'
import { createIssueComment } from '../api/github.api'
import { fetchIssueForTracking, mergeTrackedIssues, pushCardToIssue } from '../api/board/trackedIssue.api'
import { applyCardPatch, splitPatch } from '../api/board/trackedIssueMapping'
import { parseCardBody } from '../api/board/cardBodyMarkdown'
import { nextTagColor, tagIdFromName } from '../app/board/boardDefaults'
import type { BoardBackend } from '../api/board/boardBackend'

function isBoardConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'BOARD_CONFLICT'
  )
}

/**
 * Data + actions for the Board (Kanban) page — lists boards from both backends for the open repo,
 * tracks which one is active (persisted, see `stores/board.store.ts`), and fetches/mutates the
 * active board's cards. Every mutation dispatches to the backend matching `Board.source`, so
 * `BoardPage` and its children never call `localBoardBackend`/`createRemoteBoardBackend` directly.
 *
 * Mutations are await-then-revalidate rather than optimistic: correct and simple beats a
 * flicker-free drag for v1 — worth revisiting once the UI has settled.
 */
export function useBoardData(repoPath: string) {
  const { t } = useTranslation('board')
  const { ownerRepo, token } = useRepoGitHub(repoPath)
  const { mutate: globalMutate } = useSWRConfig()

  const remoteBackend = useMemo(
    () => (ownerRepo && token ? createRemoteBoardBackend(ownerRepo.owner, ownerRepo.repo, token) : null),
    [ownerRepo, token]
  )

  const { data: localBoards, isLoading: localLoading } = useSWR(
    ['board-list', 'local' as BoardSource, repoPath],
    () => localBoardBackend.listBoards(repoPath),
    { revalidateOnFocus: false }
  )
  const { data: remoteBoards, isLoading: remoteLoading } = useSWR(
    remoteBackend ? ['board-list', 'remote' as BoardSource, repoPath] : null,
    () => remoteBackend!.listBoards(repoPath),
    { revalidateOnFocus: false }
  )

  const boards = useMemo(
    () => [...(localBoards ?? []), ...(remoteBoards ?? [])],
    [localBoards, remoteBoards]
  )

  const storedActiveId = useBoardStore((s) => s.activeBoardIdByRepo[repoPath])
  const setActiveBoardInStore = useBoardStore((s) => s.setActiveBoard)
  const activeBoard = boards.find((b) => b.id === storedActiveId) ?? boards[0] ?? null

  function setActiveBoard(boardId: string) {
    setActiveBoardInStore(repoPath, boardId)
  }

  function backendFor(source: BoardSource): BoardBackend {
    if (source === 'local') return localBoardBackend
    if (!remoteBackend) throw new Error('This repository has no connected GitHub account')
    return remoteBackend
  }

  const {
    data: boardDetail,
    isLoading: cardsLoading,
    mutate: mutateDetail,
  } = useSWR(
    // `Boolean(token)` is part of the key so the board refetches when a GitHub account is connected
    // or disconnected: without a token the tracked cards below can't be merged, and the difference
    // is visible on screen.
    activeBoard
      ? ['board-detail', activeBoard.source, repoPath, activeBoard.id, Boolean(token)]
      : null,
    async () => {
      const detail = await backendFor(activeBoard!.source).getBoard(repoPath, activeBoard!.id)
      // Only a local board can hold tracked cards — a remote card already *is* an issue.
      if (activeBoard!.source !== 'local' || !token) return detail
      return { ...detail, cards: await mergeTrackedIssues(detail.board, detail.cards, token) }
    },
    { revalidateOnFocus: false }
  )

  function revalidateLists() {
    void globalMutate((key) => Array.isArray(key) && key[0] === 'board-list')
  }

  /**
   * The board to build a board-level write's `expectedRevision` from.
   *
   * `activeBoard` comes from the board **list**, which no card mutation revalidates — and on the
   * local backend a board's revision is its ref tip, so it advances every time a card is written.
   * The detail fetch *is* revalidated by those writes, so its copy is the one that stays current;
   * using the list's would reject the next board-level write as a conflict.
   */
  function revisionFor(board: Board): string {
    return boardDetail?.board.id === board.id ? boardDetail.board.revision : board.revision
  }

  /** Runs a CAS-guarded mutation; on a `BOARD_CONFLICT`, toasts and refreshes instead of throwing —
   * every other error still propagates for the caller's own error handling. */
  async function withConflictToast<T>(run: () => Promise<T>): Promise<T | null> {
    try {
      return await run()
    } catch (error) {
      if (isBoardConflict(error)) {
        toast.error(t('conflict.message'))
        await mutateDetail()
        return null
      }
      throw error
    }
  }

  async function createBoard(
    name: string,
    columns: BoardColumn[],
    source: BoardSource,
    dodTemplate = '',
    cardPrefix = ''
  ): Promise<Board> {
    const board = await backendFor(source).createBoard(
      repoPath,
      name,
      columns,
      dodTemplate,
      cardPrefix
    )
    revalidateLists()
    setActiveBoard(board.id)
    return board
  }

  async function updateBoardColumns(columns: BoardColumn[]): Promise<void> {
    if (!activeBoard) return
    const result = await withConflictToast(() =>
      backendFor(activeBoard.source).updateBoardColumns(
        repoPath,
        activeBoard.id,
        columns,
        revisionFor(activeBoard)
      )
    )
    if (result) {
      revalidateLists()
      void mutateDetail()
    }
  }

  async function deleteBoard(board: Board): Promise<void> {
    await backendFor(board.source).deleteBoard(repoPath, board.id)
    revalidateLists()
    if (activeBoard?.id === board.id) {
      const next = boards.find((b) => b.id !== board.id)
      if (next) setActiveBoard(next.id)
    }
  }

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
    const card = await backendFor(activeBoard.source).createCard(
      repoPath,
      activeBoard.id,
      columnId,
      { title, description, prefix, kind }
    )
    void mutateDetail()
    return card
  }

  /**
   * The issues this board already tracks — what "add an issue" refuses to duplicate, and what the
   * picker greys out. Archived cards count: the issue is still spoken for, and adding a second card
   * for it would resurrect it under a different id.
   */
  const trackedIssueNumbers = useMemo(
    () =>
      (boardDetail?.cards ?? [])
        .map((c) => c.sourceIssue?.number)
        .filter((n): n is number => n !== undefined),
    [boardDetail]
  )

  /** The issue a card tracks, or `null` — tracking needs a local board and a usable token. */
  function trackedRef(card: BoardCard) {
    if (!activeBoard || activeBoard.source !== 'local') return null
    if (!card.sourceIssue || !token) return null
    return card.sourceIssue
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
        await pushCardToIssue(
          boardDetail?.board ?? activeBoard,
          applyCardPatch(card, patch),
          ref,
          token!
        )
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
    const copy = await backendFor(activeBoard.source).createCard(
      repoPath,
      activeBoard.id,
      card.columnId,
      {
        title: t('card.duplicateTitle', { title: card.title }),
        description: card.description,
        // A copy is the same *kind* of work under the same sequence, but it is a new ticket and
        // takes the next number of its own.
        prefix: card.prefix,
        kind: card.kind,
      }
    )
    const patched = await backendFor(activeBoard.source).updateCard(
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
   * A card's discussion. A plain local card carries its own; a remote card's — and a tracked card's —
   * live on GitHub and are fetched per card on open, so a fifty-card board doesn't pay fifty extra
   * requests on every load for a thread only the opened dialog shows.
   */
  async function loadComments(card: BoardCard): Promise<BoardComment[]> {
    const ref = trackedRef(card)
    if (ref) return fetchRemoteCardComments(ref.owner, ref.repo, token!, String(ref.number))
    if (!activeBoard || activeBoard.source === 'local') return card.comments
    if (!ownerRepo || !token) return []
    return fetchRemoteCardComments(ownerRepo.owner, ownerRepo.repo, token, card.id)
  }

  async function updateBoardMeta(
    name: string,
    tags: BoardTag[],
    dodTemplate: string,
    cardPrefixes: string[]
  ): Promise<void> {
    if (!activeBoard) return
    const result = await withConflictToast(() =>
      backendFor(activeBoard.source).updateBoardMeta(
        repoPath,
        activeBoard.id,
        name,
        tags,
        dodTemplate,
        cardPrefixes,
        revisionFor(activeBoard)
      )
    )
    if (result) {
      revalidateLists()
      void mutateDetail()
    }
  }

  /**
   * Creates a tag on the board and puts it on the card, in that order.
   *
   * The order is why this lives here rather than in the picker. On the local backend a card's
   * `revision` is the *board's* ref tip — a whole-board version stamp, see `git_board.rs` — so
   * writing the palette moves it, and patching the card afterwards with the revision captured before
   * that write is a guaranteed `BOARD_CONFLICT`. The detail is therefore re-read in between and the
   * patch built from the card as it now stands.
   */
  async function createTagAndAssign(card: BoardCard, name: string): Promise<BoardTag | null> {
    if (!activeBoard) return null
    const trimmed = name.trim()
    if (!trimmed) return null

    const backend = backendFor(activeBoard.source)
    // Read the board straight from the backend rather than trusting either cache: on a local board a
    // revision is the ref tip, which advances on *every* write — including card writes, which don't
    // revalidate the board list. Both halves of this operation are built from a fresh read for that
    // reason; using a held copy is what made the palette write fail outright.
    const { board: current } = await backend.getBoard(repoPath, activeBoard.id)

    const id = tagIdFromName(trimmed)
    const existing = current.tags.find(
      (tag) => tag.id === id || tag.name.toLowerCase() === trimmed.toLowerCase()
    )
    const tag: BoardTag = existing ?? {
      id,
      name: trimmed,
      color: nextTagColor(current.tags.length),
    }

    if (!existing) {
      const board = await withConflictToast(() =>
        backend.updateBoardMeta(
          repoPath,
          current.id,
          current.name,
          [...current.tags, tag],
          current.dodTemplate,
          current.cardPrefixes,
          current.revision
        )
      )
      if (!board) return null
      revalidateLists()
    }

    // Read again: the palette write just moved the revision the card carries.
    const { cards } = await backend.getBoard(repoPath, activeBoard.id)
    const freshCard = cards.find((c) => c.id === card.id)
    if (!freshCard) return tag
    if (freshCard.tagIds.includes(tag.id)) return tag

    const assigned = await withConflictToast(() =>
      backendFor(activeBoard.source).updateCard(
        repoPath,
        activeBoard.id,
        freshCard.id,
        { tagIds: [...freshCard.tagIds, tag.id] },
        freshCard.revision
      )
    )
    void mutateDetail()
    return assigned ? tag : null
  }

  /**
   * Ends a sprint: optionally opens a successor with the same setup and **moves** the unfinished
   * cards into it, then freezes `summary` onto the board being closed.
   *
   * The successor is created and filled *before* the close, so a failure part-way leaves a sprint
   * that is still open and still owns its cards — recoverable by retrying — rather than a closed,
   * read-only sprint whose work has nowhere to go.
   */
  async function closeSprint(
    summary: SprintSummary,
    successor: { name: string; carryOverCardIds: string[] } | null
  ): Promise<Board | null> {
    if (!activeBoard) return null
    const backend = backendFor(activeBoard.source)

    let carriedOverToBoardId: string | undefined
    if (successor) {
      const next = await backend.createBoard(
        repoPath,
        successor.name,
        activeBoard.columns,
        activeBoard.dodTemplate,
        // The successor offers the same prefixes; the carried-over cards keep their own identifiers
        // regardless, since a prefix belongs to the card.
        activeBoard.cardPrefixes[0] ?? ''
      )
      if (successor.carryOverCardIds.length > 0) {
        await backend.moveCardsToBoard(
          repoPath,
          activeBoard.id,
          next.id,
          successor.carryOverCardIds
        )
      }
      carriedOverToBoardId = next.id
    }

    const closed = await withConflictToast(() =>
      backend.closeBoard(
        repoPath,
        activeBoard.id,
        { ...summary, carriedOverToBoardId },
        revisionFor(activeBoard)
      )
    )
    revalidateLists()
    void mutateDetail()
    if (carriedOverToBoardId) setActiveBoard(carriedOverToBoardId)
    return closed
  }

  /** "Convert to GitHub issue" — a local card only, since a remote card already is one: creates the
   * issue on `targetBoardId`/`targetColumnId`, then removes the original local card. */
  async function convertCardToIssue(
    card: BoardCard,
    targetBoardId: string,
    targetColumnId: string
  ): Promise<void> {
    if (!remoteBackend) throw new Error('This repository has no connected GitHub account')
    await remoteBackend.createCard(repoPath, targetBoardId, targetColumnId, {
      title: card.title,
      description: card.description,
      prefix: card.prefix,
      kind: card.kind,
    })
    await localBoardBackend.deleteCard(repoPath, card.boardId, card.id)
    revalidateLists()
    void mutateDetail()
  }

  /**
   * "Add to board" (issue → card) for the *active* board.
   *
   * A remote board just labels the existing issue — no new issue is created, see
   * `addExistingIssueToColumn`. A local board creates a **tracked** card: it stores the link and a
   * copy of the issue's content as its offline cache, and from then on the issue is the source of
   * truth for everything but the card's placement.
   *
   * One issue, at most one card. Two cards tracking the same issue would each claim to own its
   * content and overwrite the other on every edit, so this refuses rather than producing a pair that
   * fight. The refusal lives here rather than only in the picker because the picker isn't the only
   * way in — a pasted reference reaches this directly.
   */
  async function addIssueToBoard(issueNumber: number, columnId: string): Promise<void> {
    if (!activeBoard) return
    if (!ownerRepo || !token) throw new Error('This repository has no connected GitHub account')
    if (activeBoard.source === 'local') {
      if (trackedIssueNumbers.includes(issueNumber)) {
        toast.error(t('addIssue.alreadyOnBoard', { number: issueNumber }))
        return
      }
      const ref = { owner: ownerRepo.owner, repo: ownerRepo.repo, number: issueNumber }
      const issue = await fetchIssueForTracking(ref, token)
      // The parsed description, not the raw body: the cache should hold what the merge would show,
      // so a card looks the same before and after its first refresh.
      const { description } = parseCardBody(issue.body)
      await localBoardBackend.createCard(repoPath, activeBoard.id, columnId, {
        title: issue.title,
        description,
        sourceIssue: ref,
      })
    } else {
      await addExistingIssueToColumn(
        ownerRepo.owner,
        ownerRepo.repo,
        token,
        activeBoard.id,
        issueNumber,
        columnId
      )
    }
    void mutateDetail()
  }

  return {
    boards,
    boardsLoading: localLoading || remoteLoading,
    activeBoard,
    setActiveBoard,
    cards: boardDetail?.cards ?? [],
    cardsLoading,
    /** Whether this repo has a connected GitHub account — gates offering a remote board at all. */
    canUseRemote: Boolean(remoteBackend),
    /** Every remote board for this repo — the picker for "Convert to GitHub issue"'s target board. */
    remoteBoards: remoteBoards ?? [],
    createBoard,
    updateBoardColumns,
    deleteBoard,
    createCard,
    updateCard,
    moveCard,
    deleteCard,
    duplicateCard,
    addComment,
    loadComments,
    updateBoardMeta,
    createTagAndAssign,
    closeSprint,
    convertCardToIssue,
    addIssueToBoard,
    untrackCard,
    trackedIssueNumbers,
    refresh: () => void mutateDetail(),
  }
}
