import { useTranslation } from '@git-manager/i18n'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@git-manager/ui'
import { Archive, ArchiveRestore, Copy, MoreHorizontal, Trash2, ArrowRightLeft } from 'lucide-react'

interface CardActionsMenuProps {
  onDuplicate?: () => void
  onArchive?: () => void
  onUnarchive?: () => void
  /** Opens the move-to-another-board dialog — see `MoveCardDialog`. */
  onMove?: () => void
  onDelete?: () => void
  /** Smaller, quieter trigger for the card face, where the menu sits on a dense tile. */
  compact?: boolean
  /**
   * The trigger's `data-testid`. Required rather than defaulted because both mount points can be on
   * screen at once — the card face is still behind the open card dialog — and a shared id there is
   * one that always matches two elements.
   */
  testId: string
}

/**
 * The `⋯` menu for a card — the actions that act on it *as a whole*, as opposed to editing one of
 * its fields, which each field owns itself.
 *
 * Shared by the card dialog's header and the card face on the board, so the same gesture is
 * available without opening the card first.
 *
 * Renders nothing when no action applies (a closed sprint's cards), so the header doesn't carry a
 * button that opens an empty menu. Delete sits below a separator, in the destructive tone, and its
 * caller is expected to confirm — it is the one entry here that nothing undoes. **Archive** is the
 * reversible neighbour it exists next to: same intent, recoverable.
 */
export function CardActionsMenu({
  onDuplicate,
  onArchive,
  onUnarchive,
  onMove,
  onDelete,
  compact,
  testId,
}: CardActionsMenuProps) {
  const { t } = useTranslation('board')
  if (!onDuplicate && !onArchive && !onUnarchive && !onMove && !onDelete) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={t('card.actions.menu')}
          aria-label={t('card.actions.menu')}
          data-testid={testId}
          // The card face's trigger must not start a drag, and must not open the card either.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className={`shrink-0 cursor-pointer rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${
            compact ? 'p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100' : 'p-1'
          }`}
        >
          <MoreHorizontal className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        </button>
      </DropdownMenuTrigger>
      {/* The menu renders in a portal, but React events bubble through the *React* tree, not the
          DOM one — so without this a click on an item also reached the card's own `onClick` and
          opened the dialog on top of the action it had just run. */}
      <DropdownMenuContent
        align="end"
        className="min-w-[180px]"
        onClick={(e) => e.stopPropagation()}
      >
        {onDuplicate && (
          <DropdownMenuItem
            className="gap-2 text-xs"
            onSelect={onDuplicate}
            data-testid="card-action-duplicate"
          >
            <Copy className="h-3.5 w-3.5" />
            {t('card.actions.duplicate')}
          </DropdownMenuItem>
        )}
        {onArchive && (
          <DropdownMenuItem
            className="gap-2 text-xs"
            onSelect={onArchive}
            data-testid="card-action-archive"
          >
            <Archive className="h-3.5 w-3.5" />
            {t('card.actions.archive')}
          </DropdownMenuItem>
        )}
        {onUnarchive && (
          <DropdownMenuItem
            className="gap-2 text-xs"
            onSelect={onUnarchive}
            data-testid="card-action-unarchive"
          >
            <ArchiveRestore className="h-3.5 w-3.5" />
            {t('card.actions.unarchive')}
          </DropdownMenuItem>
        )}
        {onMove && (
          <DropdownMenuItem
            className="gap-2 text-xs"
            onSelect={onMove}
            data-testid="card-action-move"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            {t('card.actions.move')}
          </DropdownMenuItem>
        )}
        {onDelete && (
          <>
            {(onDuplicate || onArchive || onUnarchive || onMove) && <DropdownMenuSeparator />}
            <DropdownMenuItem
              className="gap-2 text-xs text-destructive focus:text-destructive"
              onSelect={onDelete}
              data-testid="card-action-delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('card.dialog.delete')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
