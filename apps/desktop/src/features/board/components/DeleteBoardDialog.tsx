import { useEffect, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import type { BoardSource } from '@git-manager/git-types'
import {
  Button,
  Checkbox,
  Spinner,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@git-manager/ui'

interface DeleteBoardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  boardName: string
  /** Which backend the board lives on — the tickets' fate differs, so the copy does too. */
  source: BoardSource
  /** How many cards are on it, archived ones included. */
  cardCount: number
  onConfirm: (deleteCards: boolean) => Promise<unknown>
}

/**
 * Confirms deleting a whole board, and asks what becomes of its tickets.
 *
 * The board itself is gone either way and this isn't locally undoable — the local backend's git
 * history goes with the ref, and the remote board's column structure with the config entry — which is
 * why it is a dialog rather than a menu item, mirroring `DeleteRemoteBranchDialog`.
 *
 * **What becomes of the tickets is the question this asks**, and there are exactly two answers,
 * because a ticket belongs to a board and cannot be left without one:
 *
 * - **Delete them.** They would be orphans otherwise, so they go — irreversibly, on both backends
 *   (locally the ref and its backup; on GitHub every issue is closed).
 * - **Archive them.** They are kept and stay findable, which means the board has to be kept too:
 *   it is *tombstoned* rather than removed, so the tickets still name the board they came from.
 *   It leaves the picker and turns read-only, reachable again through "show deleted boards".
 *
 * An earlier version offered a third thing that did not exist — keeping the
 * `~/.git-manager/boards/` mirror and calling the board "recoverable" — while nothing in the app
 * reads a recoverable board back. It promised a rescue and left an orphaned file.
 */
export function DeleteBoardDialog({
  open,
  onOpenChange,
  boardName,
  source,
  cardCount,
  onConfirm,
}: DeleteBoardDialogProps) {
  const { t } = useTranslation('board')
  const [pending, setPending] = useState(false)
  // Defaults to on: it is what deleting a board has always done, and the box exists to let someone
  // opt *out* of erasure rather than to make erasure a thing they have to ask for.
  const [deleteCards, setDeleteCards] = useState(true)

  useEffect(() => {
    if (open) setDeleteCards(true)
  }, [open])

  async function handleConfirm() {
    setPending(true)
    try {
      await onConfirm(deleteCards)
      onOpenChange(false)
    } catch {
      // Reported by the action layer (`reportWriteFailures`); swallowed here so the rejection isn't
      // an unhandled one, and so the dialog stays open on what the user typed.
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="delete-board-dialog">
        <DialogHeader>
          <DialogTitle>{t('deleteBoard.title', { name: boardName })}</DialogTitle>
          <DialogDescription>{t('deleteBoard.description')}</DialogDescription>
        </DialogHeader>

        {cardCount > 0 && (
          <div className="space-y-2 rounded border border-border bg-card/40 p-2.5">
            <label className="flex cursor-pointer items-start gap-2 text-xs">
              <Checkbox
                checked={deleteCards}
                onChange={(e) => setDeleteCards(e.target.checked)}
                disabled={pending}
                data-testid="delete-board-delete-cards"
              />
              <span className="font-medium text-foreground">
                {t('deleteBoard.deleteCardsLabel', { count: cardCount })}
              </span>
            </label>
            {/* The consequence of *both* answers is spelled out, because neither is obvious: erasing
                is irreversible, and keeping them means the board itself sticks around. */}
            <p
              className={`text-[11px] leading-relaxed ${
                deleteCards ? 'text-destructive' : 'text-muted-foreground'
              }`}
              data-testid="delete-board-cards-hint"
            >
              {t(`deleteBoard.${source}.${deleteCards ? 'deleteCardsHint' : 'archiveCardsHint'}`, {
                count: cardCount,
              })}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>
            {t('card.dialog.cancel')}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5"
            onClick={() => void handleConfirm()}
            disabled={pending}
            data-testid="delete-board-confirm"
          >
            {pending && <Spinner className="h-3 w-3" />}
            {t('deleteBoard.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
