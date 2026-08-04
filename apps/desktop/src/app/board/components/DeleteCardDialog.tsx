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
import { Archive } from 'lucide-react'

interface DeleteCardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cardTitle: string
  onConfirm: () => Promise<unknown>
  /** Offers archiving from the same dialog — the reversible alternative to what is being asked. */
  onArchive?: () => Promise<unknown>
}

/**
 * Confirms deleting a card.
 *
 * Deleting a card destroys its description, checklist and whole comment thread, and nothing in the
 * app brings it back — unlike a board, which has a disaster-recovery mirror. That asymmetry is why
 * this exists where other card actions just happen.
 *
 * Archiving is offered right here rather than only in the menu: someone reaching for delete usually
 * wants the card gone from the board, which is what archiving does without losing anything.
 */
export function DeleteCardDialog({
  open,
  onOpenChange,
  cardTitle,
  onConfirm,
  onArchive,
}: DeleteCardDialogProps) {
  const { t } = useTranslation('board')
  const [pending, setPending] = useState(false)

  async function run(action: () => Promise<unknown>) {
    setPending(true)
    try {
      await action()
      onOpenChange(false)
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="delete-card-dialog">
        <DialogHeader>
          <DialogTitle>{t('deleteCard.title')}</DialogTitle>
          <DialogDescription>
            {t('deleteCard.description', { title: cardTitle })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="items-center justify-between sm:justify-between">
          {onArchive ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={pending}
              onClick={() => void run(onArchive)}
              data-testid="delete-card-archive-instead"
            >
              <Archive className="h-3.5 w-3.5" />
              {t('card.actions.archive')}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              {t('card.dialog.cancel')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              disabled={pending}
              onClick={() => void run(onConfirm)}
              data-testid="delete-card-confirm"
            >
              {pending && <Spinner className="h-3 w-3" />}
              {t('deleteCard.confirm')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
