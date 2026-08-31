import { useEffect, useMemo } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Spinner } from '@git-manager/ui'
import { Kanban } from 'lucide-react'
import type { BoardCard } from '@git-manager/git-types'
import { formatShortDate } from '../../lib/relativeDate'
import { useBoardData } from './hooks/useBoardData'
import { useBoardControlsStore } from './stores/boardControls.store'
import { useBoardDialogsStore } from './stores/boardDialogs.store'
import { BoardColumnsArea } from './components/BoardColumnsArea'
import { BoardDialogsManager } from './components/BoardDialogsManager'
import { SprintSummaryView } from './components/SprintSummaryView'
import { columnMoveTargetsFor, moveTargetsFor } from './lib/cardMoveTargets'
import { useBoardAssigneeAvatars } from './hooks/useBoardAssigneeAvatars'

interface BoardPageProps {
  repoPath: string
}

/**
 * The Kanban board view — one of a repo tab's three, generic over both backends via `useBoardData`,
 * with `@dnd-kit` driving cross-column drag and in-column reorder.
 *
 * What is left here is the board itself: its columns, the banners that say why it is read-only, and
 * the dialogs it can raise. Its *chrome* is elsewhere, because the chrome is the repo tab's and not
 * the page's — `BoardToolbar` holds the actions, `BoardSidebar` holds the board list, and both are
 * mounted by the workspace while this view is the active one. `boardDialogs.store` is the seam that
 * lets a button up there open a dialog rendered down here.
 */
export function BoardPage({ repoPath }: BoardPageProps) {
  const { t, i18n } = useTranslation('board')
  const data = useBoardData(repoPath)
  const {
    boards,
    boardsLoading,
    activeBoard,
    cards,
    cardsLoading,
    updateCard,
    moveCard,
    duplicateCard,
  } = data

  const dialogs = useBoardDialogsStore()
  // Once for the board, not once per card — see the hook.
  const avatarUrlFor = useBoardAssigneeAvatars(repoPath)

  // Leaving the view must not leave a modal armed for the next time it is opened, nor a search
  // filtering a board the user comes back to weeks later. Both states are stores now — they used to
  // be `useState` here and died with the page, which is the behaviour this restores.
  useEffect(
    () => () => {
      useBoardDialogsStore.getState().reset()
      useBoardControlsStore.getState().reset()
    },
    []
  )

  /**
   * Both states make the board read-only, for different reasons that land in the same place: a
   * closed sprint's report is frozen, and a deleted board only still exists so that the tickets
   * archived on it have something to be attached to. Neither is somewhere work happens.
   */
  const isClosed = Boolean(activeBoard?.closedAt) || Boolean(activeBoard?.deletedAt)

  /**
   * What the columns show: the cards that have not been archived.
   *
   * There used to be a query here as well — the board's own card filter, which also brought archived
   * cards back into the columns while it was set. Finding a ticket is `BoardSearchDialog`'s job now
   * (⌘F, or the toolbar's button), across every board rather than this one, and it finds archived
   * cards too. So archiving still hides without losing; what changed is where you go to look.
   */
  const filteredCards = useMemo(() => cards.filter((c) => !c.archivedAt), [cards])

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
                is. Only reachable at all through the sidebar's "show deleted" toggle. */}
            {activeBoard.deletedAt && (
              <div
                className="flex shrink-0 flex-wrap items-center gap-3 rounded border border-destructive/30 bg-destructive/5 px-3 py-2"
                data-testid="board-deleted-banner"
              >
                <p className="text-xs font-medium text-foreground">
                  {t('deleteBoard.deletedNotice')}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {t('deleteBoard.deletedOn', {
                    date: formatShortDate(
                      new Date(activeBoard.deletedAt).getTime() / 1000,
                      i18n.language
                    ),
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
                      date: formatShortDate(
                        new Date(activeBoard.closedAt).getTime() / 1000,
                        i18n.language
                      ),
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
