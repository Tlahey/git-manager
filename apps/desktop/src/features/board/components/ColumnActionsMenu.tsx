import { useTranslation } from '@git-manager/i18n'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@git-manager/ui'
import { Archive, ArrowRightLeft, MoreHorizontal } from 'lucide-react'

export interface ColumnActions {
  /** Puts every card still on the board in this column away, after a confirmation. */
  onArchiveAll?: () => void
  /** Opens the picker that empties this column into another board — see `MoveColumnDialog`. */
  onMoveAll?: () => void
}

interface ColumnActionsMenuProps extends ColumnActions {
  /** How many cards the actions would take — the menu is worth nothing over an empty column. */
  cardCount: number
  testId: string
}

/**
 * The `⋯` menu on a column header: the actions that act on the column's **cards as a set**, rather
 * than on the column itself.
 *
 * Deliberately separate from `ColumnEditorDialog`, which owns the column as a *structure* — its name,
 * order, colour and done flag. Renaming a column and emptying it are not neighbours: one is a change
 * to the board's shape and the other moves work around inside it.
 *
 * Renders nothing when the column is empty or when no action applies (a closed sprint), so a column
 * never carries a button that opens a menu with nothing in it. Both entries are non-destructive —
 * archiving is reversible from the archive list and a move can be moved back — which is why neither
 * sits behind a danger zone the way the archive purge does; they still confirm, because they act on
 * more than the one thing the user clicked.
 */
export function ColumnActionsMenu({
  onArchiveAll,
  onMoveAll,
  cardCount,
  testId,
}: ColumnActionsMenuProps) {
  const { t } = useTranslation('board')
  if (cardCount === 0 || (!onArchiveAll && !onMoveAll)) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={t('column.actions.menu')}
          aria-label={t('column.actions.menu')}
          data-testid={testId}
          className="shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus:opacity-100 group-hover/column:opacity-100"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        {onArchiveAll && (
          <DropdownMenuItem
            className="gap-2 text-xs"
            onSelect={onArchiveAll}
            data-testid="column-action-archive-all"
          >
            <Archive className="h-3.5 w-3.5" />
            {t('column.actions.archiveAll', { count: cardCount })}
          </DropdownMenuItem>
        )}
        {onMoveAll && (
          <DropdownMenuItem
            className="gap-2 text-xs"
            onSelect={onMoveAll}
            data-testid="column-action-move-all"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            {t('column.actions.moveAll', { count: cardCount })}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
