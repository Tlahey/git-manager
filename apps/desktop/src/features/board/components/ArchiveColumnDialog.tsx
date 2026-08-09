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

interface ArchiveColumnDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  columnName: string
  /** How many cards would be put away — the live ones, archived cards being already away. */
  count: number
  onConfirm: () => Promise<unknown>
}

/**
 * Confirms archiving everything in one column.
 *
 * Archiving a single card doesn't ask, and shouldn't: it acts on the thing the user pointed at, and
 * the card is one click from coming back. This asks because the gesture reaches past what was
 * clicked — a column header stands for its cards without naming any of them, and "how many" is the
 * fact a reader needs before agreeing. It stays a plain confirmation rather than a destructive one:
 * nothing is lost, the cards are in the archive list, and the button says so.
 */
export function ArchiveColumnDialog({
  open,
  onOpenChange,
  columnName,
  count,
  onConfirm,
}: ArchiveColumnDialogProps) {
  const { t } = useTranslation('board')
  const [pending, setPending] = useState(false)

  async function run() {
    setPending(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch {
      // Reported by `reportWriteFailures`; swallowed so the rejection doesn't escape the handler, and
      // so the dialog stays open on a column that is still full.
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="archive-column-dialog">
        <DialogHeader>
          <DialogTitle>{t('archiveColumn.title', { column: columnName })}</DialogTitle>
          <DialogDescription>
            {t('archiveColumn.description', { count, column: columnName })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {t('card.dialog.cancel')}
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={pending}
            onClick={() => void run()}
            data-testid="archive-column-confirm"
          >
            {pending ? <Spinner className="h-3 w-3" /> : <Archive className="h-3.5 w-3.5" />}
            {t('archiveColumn.confirm', { count })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
