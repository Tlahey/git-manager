import { useTranslation } from '@git-manager/i18n'
import { useBoardBackends } from './useBoardBackends'
import { useBoardCatalog } from './useBoardCatalog'
import { useBoardDetail } from './useBoardDetail'
import { useBoardActions } from './useBoardActions'
import { useBoardCardActions } from './useBoardCardActions'
import { useCardIssueTracking } from './useCardIssueTracking'
import { useCardTagCreation } from './useCardTagCreation'
import { useRecoverableBoards } from './useRecoverableBoards'
import { reportWriteFailures } from './reportWriteFailures'

/**
 * Data + actions for the Board (Kanban) page — lists boards from both backends for the open repo,
 * tracks which one is active (persisted, see `../stores/board.store.ts`), and fetches/mutates the
 * active board's cards. Every mutation dispatches to the backend matching `Board.source`, so
 * `BoardPage` and its children never call `localBoardBackend`/`createRemoteBoardBackend` directly.
 *
 * This file is the **composition** and nothing else: the pieces it assembles live one folder down in
 * `hooks/`, split by what they write rather than by which screen calls them — backends
 * (`useBoardBackends`), the board list and the open board (`useBoardCatalog`, `useBoardDetail`),
 * board-level writes (`useBoardActions`), card-level writes (`useBoardCardActions`), the
 * card ⇄ GitHub-issue seam (`useCardIssueTracking`) and the one two-write operation that has to
 * order its halves (`useCardTagCreation`). The returned surface is what `BoardPage` consumes, and is
 * deliberately flat: a component asking for `cards` should not have to know which of these produced
 * them.
 */
export type BoardData = ReturnType<typeof useBoardData>

export function useBoardData(repoPath: string) {
  const { t } = useTranslation('board')
  const { ownerRepo, accountId, remoteBackend, backendFor } = useBoardBackends(repoPath)
  const catalog = useBoardCatalog(repoPath, remoteBackend)
  const { activeBoard, revalidateLists } = catalog
  const detail = useBoardDetail(repoPath, activeBoard, backendFor, accountId)
  const cards = detail.boardDetail?.cards ?? []

  const boardActions = useBoardActions({ repoPath, catalog, detail, backendFor })
  const tracking = useCardIssueTracking({
    repoPath,
    activeBoard,
    cards,
    ownerRepo,
    accountId,
    mutateDetail: () => void detail.mutateDetail(),
  })
  const cardActions = useBoardCardActions({
    repoPath,
    activeBoard,
    boards: catalog.boards,
    detail,
    backendFor,
    remoteBackend,
    revalidateLists,
    trackedRef: tracking.trackedRef,
    accountId,
  })
  const createTagAndAssign = useCardTagCreation({
    repoPath,
    activeBoard,
    detail,
    backendFor,
    revalidateLists,
  })
  const recovery = useRecoverableBoards({
    repoPath,
    setActiveBoard: catalog.setActiveBoard,
    revalidateLists,
  })

  // Every action, wrapped once so a failed write is reported rather than lost — see the module.
  // Wrapping the whole returned object rather than each function means a mutation added later is
  // covered by having been added, not by someone remembering to.
  return reportWriteFailures(
    {
      boards: catalog.boards,
      boardsLoading: catalog.boardsLoading,
      activeBoard,
      setActiveBoard: catalog.setActiveBoard,
      cards,
      cardsLoading: detail.cardsLoading,
      /** Whether this repo has a connected GitHub account — gates offering a remote board at all. */
      canUseRemote: Boolean(remoteBackend),
      ...boardActions,
      ...cardActions,
      createTagAndAssign,
      loadComments: tracking.loadComments,
      addIssueToBoard: tracking.addIssueToBoard,
      trackedIssueNumbers: tracking.trackedIssueNumbers,
      recoverableBoards: recovery.recoverableBoards,
      recoverableBoardsLoading: recovery.recoverableBoardsLoading,
      restoreBoard: recovery.restoreBoard,
      refresh: () => void detail.mutateDetail(),
    },
    t('write.failed')
  )
}
