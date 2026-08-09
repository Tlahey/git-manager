import { useTranslation } from '@git-manager/i18n'
import { Button, Checkbox, Input } from '@git-manager/ui'
import {
  Archive,
  FlagOff,
  Kanban,
  ListPlus,
  Plus,
  Settings2,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import type { Board } from '@git-manager/git-types'
import { BoardSprintPicker } from './BoardSprintPicker'

interface BoardPageHeaderProps {
  boards: Board[]
  activeBoard: Board | null
  onSelectBoard: (boardId: string) => void
  search: string
  onSearchChange: (search: string) => void
  showClosed: boolean
  onShowClosedChange: (showClosed: boolean) => void
  canUseRemote: boolean
  onAddIssue: () => void
  /** How many cards this board has archived — the button only appears once there is one. */
  archivedCount: number
  onOpenArchived: () => void
  onEditColumns: () => void
  onOpenSettings: () => void
  /** Omitted on a board that is not an iteration — there is no period to close. */
  onCloseSprint?: () => void
  onDeleteBoard: () => void
  onCreateBoard: () => void
}

/**
 * The board page's toolbar: which board, the search box, and the board-level actions.
 *
 * Split out of `BoardPage` because that file had grown past the one-responsibility line — it now
 * owns the board's data wiring and its dialogs, and this owns the chrome. Purely presentational: it
 * holds no state and calls back for everything.
 *
 * A **closed** sprint keeps only the actions that still mean something — you can still delete it or
 * start a new board, but not edit its columns, settings, or close it twice.
 */
export function BoardPageHeader({
  boards,
  activeBoard,
  onSelectBoard,
  search,
  onSearchChange,
  showClosed,
  onShowClosedChange,
  canUseRemote,
  onAddIssue,
  archivedCount,
  onOpenArchived,
  onEditColumns,
  onOpenSettings,
  onCloseSprint,
  onDeleteBoard,
  onCreateBoard,
}: BoardPageHeaderProps) {
  const { t } = useTranslation('board')
  const isClosed = Boolean(activeBoard?.closedAt)

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card/50 px-5 py-2.5 backdrop-blur-xs">
      <div className="flex items-center gap-2">
        <Kanban className="h-4 w-4 text-primary" />
        <h1 className="text-sm font-bold tracking-wide text-foreground">{t('tabLabel')}</h1>
      </div>
      <div className="h-4 w-px bg-border" />

      {boards.length > 0 ? (
        <BoardSprintPicker boards={boards} activeBoard={activeBoard} onSelect={onSelectBoard} />
      ) : (
        <span className="text-xs text-muted-foreground">{t('page.noBoards')}</span>
      )}

      <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
        <Checkbox
          checked={showClosed}
          onChange={(e) => onShowClosedChange(e.target.checked)}
          data-testid="board-show-closed"
        />
        {t('sprint.showClosed')}
      </label>

      <div className="ml-auto flex items-center gap-2">
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('page.searchPlaceholder')}
          className="h-7 w-48 text-xs"
          data-testid="board-search-input"
        />
        {activeBoard && (
          <>
            {canUseRemote && !isClosed && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={onAddIssue}
                data-testid="board-add-issue-button"
              >
                <ListPlus className="h-3.5 w-3.5" /> {t('page.addIssue')}
              </Button>
            )}
            {/* Only once something has been archived: an empty archive is not worth a permanent
                button, and the count is the reason to open it. */}
            {archivedCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={onOpenArchived}
                data-testid="board-archived-button"
              >
                <Archive className="h-3.5 w-3.5" /> {t('page.archived', { count: archivedCount })}
              </Button>
            )}
            {!isClosed && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={onEditColumns}
                  data-testid="board-edit-columns-button"
                >
                  <Settings2 className="h-3.5 w-3.5" /> {t('page.editColumns')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={onOpenSettings}
                  data-testid="board-settings-button"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" /> {t('boardSettings.title')}
                </Button>
                {onCloseSprint && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={onCloseSprint}
                    data-testid="board-close-sprint-button"
                  >
                    <FlagOff className="h-3.5 w-3.5" /> {t('sprint.close')}
                  </Button>
                )}
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={onDeleteBoard}
              data-testid="board-delete-button"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        <Button
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={onCreateBoard}
          data-testid="create-board-button"
        >
          <Plus className="h-3.5 w-3.5" /> {t('page.newBoard')}
        </Button>
      </div>
    </header>
  )
}
