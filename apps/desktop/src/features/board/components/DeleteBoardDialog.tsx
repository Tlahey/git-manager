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
import { AlertTriangle } from 'lucide-react'

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
 * **What becomes of the tickets is asked only where it is a question**, which is on a GitHub board:
 * an issue outlives the board either way, since deleting one merely stops labelling it, so someone
 * has to say whether the work is over. Ticking the box closes every one of them.
 *
 * On a **local** board the cards are inside the ref and go with it, so there is nothing to ask — the
 * dialog states the loss instead, and names the two ways to avoid it. That was briefly a checkbox
 * too, whose unticked branch kept the `~/.git-manager/boards/` mirror and called the board
 * "recoverable"; nothing in the app reads a recoverable board back, so it promised a rescue and left
 * an orphaned file. It also blurred the distinction the board model does make: **archiving** keeps a
 * ticket and leaves it findable by search, **deleting** does not. Keeping work out of a board being
 * deleted happens on the board, before it goes.
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

        {cardCount > 0 && source === 'remote' && (
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
            <p className="text-[11px] leading-relaxed text-muted-foreground" data-testid="delete-board-cards-hint">
              {t(deleteCards ? 'deleteBoard.remote.deleteCardsHint' : 'deleteBoard.remote.keepCardsHint')}
            </p>
          </div>
        )}

        {cardCount > 0 && source === 'local' && (
          <div
            className="flex items-start gap-2 rounded border border-destructive/30 bg-destructive/5 p-2.5"
            data-testid="delete-board-cards-lost"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t('deleteBoard.local.cardsLost', { count: cardCount })}
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
