import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from '@git-manager/ui'
import { Archive } from 'lucide-react'

interface StashConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  cancelLabel: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void | Promise<void>
  pending?: boolean
  /** data-testid applied to the dialog root */
  testId?: string
  /** data-testid applied to the confirm button */
  confirmTestId?: string
}

/**
 * Generic "stash your changes to proceed" confirmation dialog.
 * Used by both the bisect flow and the branch checkout flow.
 */
export function StashConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  pending = false,
  testId,
  confirmTestId,
}: StashConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid={testId}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={pending}
            className="gap-1.5"
            data-testid={confirmTestId}
          >
            <Archive className="h-4 w-4" />
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
