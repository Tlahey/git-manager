import { useMemo, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Spinner } from '@git-manager/ui'
import { Kanban } from 'lucide-react'
import type { BoardCard } from '@git-manager/git-types'
import { useBoardData } from './hooks/useBoardData'
import { useBoardControlsStore } from './stores/boardControls.store'
import { BoardPageHeader } from './components/BoardPageHeader'
import { BoardColumnsArea } from './components/BoardColumnsArea'
import { BoardDialogsManager } from './components/BoardDialogsManager'
import { SprintSummaryView } from './components/SprintSummaryView'
import { columnMoveTargetsFor, moveTargetsFor } from './lib/cardMoveTargets'
import { isIterationBoard } from './lib/boardIteration'
import { useBoardDialogs } from './hooks/useBoardDialogs'
import { useBoardAssigneeAvatars } from './hooks/useBoardAssigneeAvatars'

interface BoardPageProps {
  repoPath: string
}

/**
 * The Kanban board page — a sibling top-level feature to Launchpad (see `App.tsx`/`TabBar.tsx`),
 * generic over both backends via `useBoardData`, with `@dnd-kit` driving cross-column drag and
 * in-column reorder.
 *
 * The page proper is the header, the columns and the closed-sprint banner. The two things that made
 * it grow live beside it: `useBoardDialogs` holds which dialog is open and the way back out of one
 * raised from another, and `BoardDialogsManager` renders them and wires each to its mutation.
 */
export function BoardPage({ repoPath }: BoardPageProps) {
  const { t } = useTranslation('board')
  const data = useBoardData(repoPath)
  const {
    boards,
    boardsLoading,
    activeBoard,
    setActiveBoard,
    cards,
    cardsLoading,
    canUseRemote,
    updateCard,
    moveCard,
    duplicateCard,
  } = data

  const search = useBoardControlsStore((s) => s.search)
  const setSearch = useBoardControlsStore((s) => s.setSearch)

  const dialogs = useBoardDialogs()
  // Once for the board, not once per card — see the hook.
  const avatarUrlFor = useBoardAssigneeAvatars(repoPath)
  // Not dialogs: filters on the board picker, which stay with the page's own view state.
  const [showClosed, setShowClosed] = useState(false)
  const [showDeleted, setShowDeleted] = useState(false)

  /**
   * Both states make the board read-only, for different reasons that land in the same place: a
   * closed sprint's report is frozen, and a deleted board only still exists so that the tickets
   * archived on it have something to be attached to. Neither is somewhere work happens.
   */
  const isClosed = Boolean(activeBoard?.closedAt) || Boolean(activeBoard?.deletedAt)

  // Closed sprints and deleted boards stay listed but out of the way, each behind its own toggle.
  // The one currently open is always shown, so a board doesn't vanish from under the user the
  // moment they close or delete it.
  const visibleBoards = useMemo(
    () =>
      boards.filter(
        (b) =>
          b.id === activeBoard?.id ||
          ((showClosed || !b.closedAt) && (showDeleted || !b.deletedAt))
      ),
    [boards, showClosed, showDeleted, activeBoard?.id]
  )

  /**
   * What the columns show.
   *
   * An archived card is hidden while browsing and returns as soon as there is a search — which is
   * the whole point of archiving over deleting: the card is still there, just out of the way. So the
   * search deliberately runs over *every* card, archived included.
   */
  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return cards.filter((c) => !c.archivedAt)
    return cards.filter(
      (c) => c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
    )
  }, [cards, search])

  /**
   * The column-wide actions, reachable from the column header's own `⋯` menu.
   *
   * Moving is offered only when there is somewhere to move to — `columnMoveTargetsFor` refuses a
   * closed sprint and the other backend — so the menu never opens onto a picker with no options.
   */
  const columnActionsFor = (columnId: string) =>
    isClosed || !activeBoard
      ? undefined
      : {
          onArchiveAll: () => dialogs.setColumnAction({ kind: 'archive', columnId }),
          onMoveAll:
            columnMoveTargetsFor(boards, activeBoard).length > 0
              ? () => dialogs.setColumnAction({ kind: 'move', columnId })
              : undefined,
        }

  /** The whole-card actions reachable from the card's own `⋯` menu, without opening it. */
  const cardActionsFor = (card: BoardCard) =>
    isClosed
      ? undefined
      : {
          onDuplicate: () => void duplicateCard(card),
          onArchive: card.archivedAt
            ? undefined
            : () => void updateCard(card, { archivedAt: new Date().toISOString() }),
          onUnarchive: card.archivedAt
            ? () => void updateCard(card, { archivedAt: null })
            : undefined,
          // No origin is remembered: this one starts on the board, and the board is where cancelling
          // it should leave you.
          onMove:
            moveTargetsFor(boards, card, activeBoard?.source ?? 'local').length > 0
              ? () => dialogs.setMovingCard(card)
              : undefined,
          onDelete: () => dialogs.setDeletingCard(card),
        }

  if (boardsLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Spinner className="h-5 w-5" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <BoardPageHeader
        boards={visibleBoards}
        activeBoard={activeBoard}
        onSelectBoard={setActiveBoard}
        search={search}
        onSearchChange={setSearch}
        showClosed={showClosed}
        onShowClosedChange={setShowClosed}
        showDeleted={showDeleted}
        onShowDeletedChange={setShowDeleted}
        readOnly={isClosed}
        canUseRemote={canUseRemote}
        onAddIssue={() => dialogs.open('addIssue')}
        archivedCount={cards.filter((c) => c.archivedAt).length}
        onOpenArchived={() => dialogs.open('archived')}
        onEditColumns={() => dialogs.open('columnEditor')}
        onOpenSettings={() => dialogs.open('boardSettings')}
        // Only an iteration ends. A standing board — a backlog a ticket passes through on its way to
        // a sprint — has no period to close, so it is offered no way to.
        onCloseSprint={
          activeBoard && isIterationBoard(activeBoard)
            ? () => dialogs.open('closeSprint')
            : undefined
        }
        // A board already deleted has nothing left to delete: its cards are archived on it, and
        // erasing it now would destroy exactly what the previous deletion chose to keep.
        onDeleteBoard={
          activeBoard?.deletedAt ? undefined : () => dialogs.open('deleteBoard')
        }
        onCreateBoard={() => dialogs.open('createBoard')}
      />

      {/* `overflow-hidden`, not `overflow-auto`: the columns are what scroll, each inside its own
          track, so a long column never drags the whole board's scrollbar with it. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        {!activeBoard ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Kanban className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">{t('page.emptyState')}</p>
            <Button size="sm" onClick={() => dialogs.open('createBoard')}>
              {t('page.newBoard')}
            </Button>
          </div>
        ) : cardsLoading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner className="h-5 w-5" />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {/* A deleted board says so in its own words: "read only" is true of it, but it is not
                what the reader needs to know — that its tickets were archived rather than destroyed
                is. Only reachable at all through the picker's "show deleted" toggle. */}
            {activeBoard.deletedAt && (
              <div
                className="flex shrink-0 flex-wrap items-center gap-3 rounded border border-destructive/30 bg-destructive/5 px-3 py-2"
                data-testid="board-deleted-banner"
              >
                <p className="text-xs font-medium text-foreground">{t('deleteBoard.deletedNotice')}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t('deleteBoard.deletedOn', {
                    date: new Date(activeBoard.deletedAt).toLocaleDateString(),
                  })}
                </p>
              </div>
            )}

            {isClosed && !activeBoard.deletedAt && (
              <div
                className="flex shrink-0 flex-wrap items-center gap-3 rounded border border-border bg-card/50 px-3 py-2"
                data-testid="board-closed-banner"
              >
                <p className="text-xs font-medium text-foreground">{t('sprint.readOnly')}</p>
                {activeBoard.closedAt && (
                  <p className="text-[11px] text-muted-foreground">
                    {t('sprint.closedOn', {
                      date: new Date(activeBoard.closedAt).toLocaleDateString(),
                    })}
                  </p>
                )}
              </div>
            )}

            {isClosed && activeBoard.summary && (
              <div className="max-h-64 max-w-md shrink-0 overflow-y-auto rounded border border-border bg-card/30 p-3">
                <h2 className="mb-2 text-xs font-semibold text-foreground">
                  {t('sprint.summaryTitle')}
                </h2>
                <SprintSummaryView summary={activeBoard.summary} />
              </div>
            )}

            <BoardColumnsArea
              board={activeBoard}
              cards={filteredCards}
              readOnly={isClosed}
              onAddCard={(columnId) => dialogs.setCardDialog({ mode: 'create', columnId })}
              onCardClick={(card) => dialogs.setCardDialog({ mode: 'edit', cardId: card.id })}
              onMoveCard={(card, columnId, order) => void moveCard(card, columnId, order)}
              cardActionsFor={cardActionsFor}
              columnActionsFor={columnActionsFor}
              avatarUrlFor={avatarUrlFor}
            />
          </div>
        )}
      </div>

      <BoardDialogsManager repoPath={repoPath} data={data} dialogs={dialogs} />
    </div>
  )
}
