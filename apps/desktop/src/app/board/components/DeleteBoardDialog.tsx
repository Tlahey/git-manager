import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import {
  Button,
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
  onConfirm: () => Promise<unknown>
}

/** Confirms deleting a whole board — unlike a single card, this isn't locally undoable for either
 * backend (the local backend's git history goes with the ref; the remote backend's cards are just
 * un-labeled, not deleted, but the board's column structure is gone), so it gets a dialog rather
 * than firing straight from a menu — mirrors `DeleteRemoteBranchDialog`. */
export function DeleteBoardDialog({ open, onOpenChange, boardName, onConfirm }: DeleteBoardDialogProps) {
  const { t } = useTranslation('board')
  const [pending, setPending] = useState(false)

  async function handleConfirm() {
    setPending(true)
    try {
      await onConfirm()
      onOpenChange(false)
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
