import { useEffect, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import type { Board } from '@git-manager/git-types'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  NativeSelect,
  Spinner,
} from '@git-manager/ui'
import { defaultColumnFor } from '../lib/cardMoveTargets'

interface MoveColumnDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Where the column may be emptied into — already filtered by `columnMoveTargetsFor`. */
  targets: Board[]
  columnName: string
  /** The column being emptied; the target board's picker defaults to a column with the same id. */
  columnId: string
  /** How many cards would move. */
  count: number
  onSubmit: (targetBoardId: string, targetColumnId: string) => Promise<unknown>
}

/**
 * Emptying a whole column into another board.
 *
 * The column twin of `MoveCardDialog`, and deliberately not the same component: the two differ in
 * what they may target. A single card can move from a local board onto GitHub, because that direction
 * *creates* an issue for it; a column cannot, because doing that per card is not one operation and a
 * failure halfway leaves a set no one can describe. `columnMoveTargetsFor` enforces that, and this
 * only renders what it returns.
 *
 * The destination column defaults to one with the same id — "In progress" stays "In progress" across
 * a sprint boundary, which is what column ids are for.
 */
export function MoveColumnDialog({
  open,
  onOpenChange,
  targets,
  columnName,
  columnId,
  count,
  onSubmit,
}: MoveColumnDialogProps) {
  const { t } = useTranslation('board')
  const [boardId, setBoardId] = useState('')
  const [targetColumnId, setTargetColumnId] = useState('')
  const [pending, setPending] = useState(false)

  const selectedBoard = targets.find((b) => b.id === boardId)

  useEffect(() => {
    if (!open) return
    const first = targets[0]
    setBoardId(first?.id ?? '')
    setTargetColumnId(first ? defaultColumnFor(first, columnId) : '')
  }, [open, targets, columnId])

  function handleBoardChange(nextBoardId: string) {
    setBoardId(nextBoardId)
    const next = targets.find((b) => b.id === nextBoardId)
    setTargetColumnId(next ? defaultColumnFor(next, columnId) : '')
  }

  async function handleSubmit() {
    if (!boardId || !targetColumnId) return
    setPending(true)
    try {
      await onSubmit(boardId, targetColumnId)
      onOpenChange(false)
    } catch {
      // Reported by `reportWriteFailures`; swallowed so the rejection doesn't escape the handler, and
      // so the dialog stays open on what the user picked.
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="move-column-dialog">
        <DialogHeader>
          <DialogTitle>{t('moveColumn.title', { column: columnName })}</DialogTitle>
          <DialogDescription>
            {t('moveColumn.description', { count, column: columnName })}
          </DialogDescription>
        </DialogHeader>

        {targets.length === 0 ? (
          <p className="text-xs text-muted-foreground" data-testid="move-column-no-targets">
            {t('moveColumn.noTargets')}
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="move-column-target-board">{t('moveCard.boardLabel')}</Label>
              <NativeSelect
                id="move-column-target-board"
                value={boardId}
                onChange={(e) => handleBoardChange(e.target.value)}
                disabled={pending}
                data-testid="move-column-target-board"
              >
                {targets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="move-column-target-column">{t('moveCard.columnLabel')}</Label>
              <NativeSelect
                id="move-column-target-column"
                value={targetColumnId}
                onChange={(e) => setTargetColumnId(e.target.value)}
                disabled={pending || !selectedBoard}
                data-testid="move-column-target-column"
              >
                {(selectedBoard?.columns ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
        )}

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
            disabled={pending || !boardId || !targetColumnId}
            onClick={() => void handleSubmit()}
            data-testid="move-column-submit"
          >
            {pending && <Spinner className="h-3 w-3" />}
            {t('moveColumn.confirm', { count })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
