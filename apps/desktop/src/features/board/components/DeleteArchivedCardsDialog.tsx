import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from '@git-manager/ui'

interface DeleteArchivedCardsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** How many cards the purge will destroy — the whole reason this confirmation is worth reading. */
  count: number
  onConfirm: () => Promise<unknown>
}

/**
 * Confirms emptying the archive: every archived card on the board, destroyed.
 *
 * The count is the confirmation. `DeleteCardDialog` can name the one card at stake and let the user
 * recognise it; here there is no title to show and no list short enough to read in a modal, so the
 * number is the only thing that tells someone whether they are about to lose three cards or ninety —
 * and it is deliberately in the title rather than buried in the body.
 *
 * Archiving is not offered as the gentler alternative the way it is when deleting one card, because
 * these cards are already archived. There is nothing softer left to do to them, which is exactly what
 * makes this the board's one bulk-destructive action and why it sits behind a danger zone.
 */
export function DeleteArchivedCardsDialog({
  open,
  onOpenChange,
  count,
  onConfirm,
}: DeleteArchivedCardsDialogProps) {
  const { t } = useTranslation('board')
  const [pending, setPending] = useState(false)

  async function run() {
    setPending(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch {
      // Staying open *is* the handling: the archive is still full, and closing would say otherwise.
      // The failure has already been said out loud by `reportWriteFailures`, which wraps every board
      // action and re-throws — swallowing it here is what keeps the re-throw from escaping the click
      // handler as an unhandled rejection.
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="delete-archived-cards-dialog">
        <DialogHeader>
          <DialogTitle>{t('purgeArchived.title', { count })}</DialogTitle>
          <DialogDescription>{t('purgeArchived.description', { count })}</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => onOpenChange(false)}>
            {t('card.dialog.cancel')}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5"
            disabled={pending}
            onClick={() => void run()}
            data-testid="delete-archived-cards-confirm"
          >
            {pending && <Spinner className="h-3 w-3" />}
            {t('purgeArchived.confirm', { count })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
