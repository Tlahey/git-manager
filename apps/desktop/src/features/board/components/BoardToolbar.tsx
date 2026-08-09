import { useTranslation } from '@git-manager/i18n'
import { ToolbarButton } from '@git-manager/components'
import { Archive, FlagOff, ListPlus, Plus, Search, Settings2, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useBoardData } from '../hooks/useBoardData'
import { useBoardControlsStore } from '../stores/boardControls.store'
import { useBoardDialogsStore } from '../stores/boardDialogs.store'
import { isIterationBoard } from '../lib/boardIteration'

interface BoardToolbarProps {
  repoPath: string
}

/**
 * The board view's section of the app toolbar — everything that acts on the board on screen.
 *
 * It used to be `BoardPageHeader`, a second bar drawn inside the page under the app's own. The two
 * are one now that the toolbar is scoped to the active view: the board's actions are on screen
 * exactly while a board is, and the graph's are not, so neither offers a command that does not
 * belong to what you are looking at.
 *
 * Purely a set of controls: the state they read is the board's own (`useBoardData`, SWR-deduped with
 * `BoardPage`'s call), and every action they raise goes through `boardDialogs.store`, which is the
 * seam that lets the buttons live here while the dialogs they open are rendered inside the page.
 *
 * A **read-only** board — a closed sprint, or one deleted with its tickets archived — keeps only the
 * actions that still mean something: you can still read its archive, but not edit its columns, its
 * settings, or close it twice.
 */
export function BoardToolbar({ repoPath }: BoardToolbarProps) {
  const { t } = useTranslation('board')
  const { activeBoard, cards, canUseRemote } = useBoardData(repoPath)

  const toggleSearch = useBoardControlsStore((s) => s.toggleSearch)
  const openDialog = useBoardDialogsStore((s) => s.open)
  const setCardDialog = useBoardDialogsStore((s) => s.setCardDialog)

  /**
   * Both states make the board read-only, for different reasons that land in the same place: a
   * closed sprint's report is frozen, and a deleted board only still exists so that the tickets
   * archived on it have something to be attached to. Neither is somewhere work happens.
   */
  const readOnly = Boolean(activeBoard?.closedAt) || Boolean(activeBoard?.deletedAt)
  const archivedCount = cards.filter((c) => c.archivedAt).length
  // A new ticket has to land in a column, and the first one is where a board's intake belongs — the
  // per-column "+" is still there for anywhere else.
  const firstColumnId = activeBoard?.columns[0]?.id

  return (
    <>
      <ToolbarButton
        icon={<Plus className="h-4 w-4 text-primary" />}
        label={t('page.newCard')}
        disabled={readOnly || !firstColumnId}
        onClick={() => firstColumnId && setCardDialog({ mode: 'create', columnId: firstColumnId })}
        data-testid="board-new-card-button"
      />
      {canUseRemote && !readOnly && (
        <ToolbarButton
          icon={<ListPlus className="h-4 w-4 text-muted-foreground" />}
          label={t('page.addIssue')}
          disabled={!activeBoard}
          onClick={() => openDialog('addIssue')}
          data-testid="board-add-issue-button"
        />
      )}
      {/* Only once something has been archived: an empty archive is not worth a permanent button,
          and the count is the reason to open it. */}
      {archivedCount > 0 && (
        <ToolbarButton
          icon={<Archive className="h-4 w-4 text-violet-400" />}
          label={t('page.archivedShort')}
          title={t('page.archived', { count: archivedCount })}
          badge={archivedCount}
          onClick={() => openDialog('archived')}
          data-testid="board-archived-button"
        />
      )}

      <div className="mx-1 h-6 w-px shrink-0 bg-border" />

      {/* Absent rather than disabled on a read-only board: a greyed-out "Columns" still says editing
          the columns is a thing you do here, and on a closed sprint or a deleted board it is not. */}
      {activeBoard && !readOnly && (
        <>
          <ToolbarButton
            icon={<Settings2 className="h-4 w-4 text-muted-foreground" />}
            label={t('page.editColumns')}
            onClick={() => openDialog('columnEditor')}
            data-testid="board-edit-columns-button"
          />
          <ToolbarButton
            icon={<SlidersHorizontal className="h-4 w-4 text-muted-foreground" />}
            label={t('boardSettings.title')}
            onClick={() => openDialog('boardSettings')}
            data-testid="board-settings-button"
          />
          {/* Only an iteration ends. A standing board — a backlog a ticket passes through on its way
              to a sprint — has no period to close, so it is offered no way to. */}
          {isIterationBoard(activeBoard) && (
            <ToolbarButton
              icon={<FlagOff className="h-4 w-4 text-amber-400" />}
              label={t('sprint.close')}
              onClick={() => openDialog('closeSprint')}
              data-testid="board-close-sprint-button"
            />
          )}
        </>
      )}
      {/* A board already deleted has nothing left to delete: its cards are archived on it, and
          erasing it now would destroy exactly what the previous deletion chose to keep. */}
      {activeBoard && !activeBoard.deletedAt && (
        <ToolbarButton
          icon={<Trash2 className="h-4 w-4 text-destructive" />}
          label={t('deleteBoard.action')}
          onClick={() => openDialog('deleteBoard')}
          data-testid="board-delete-button"
        />
      )}

      <div className="bg-border mx-1 h-6 w-px shrink-0" />

      {/* Last, as on every view — and a button rather than a field standing open on the bar: the
          field appears over the board it filters (`BoardSearchPanel`). Search is the one action all
          three views share, so it sits in the same place on each; a control whose position depends
          on the view is one you have to look for every time you switch. */}
      <ToolbarButton
        icon={<Search className="text-muted-foreground h-4 w-4" />}
        label={t('git:toolbar.searchLabel')}
        title={`${t('page.searchPlaceholder')} (⌘F)`}
        onClick={toggleSearch}
        data-testid="board-search-button"
      />
    </>
  )
}
