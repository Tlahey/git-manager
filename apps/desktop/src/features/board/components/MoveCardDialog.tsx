import { useEffect, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import type { Board } from '@git-manager/git-types'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Label,
  NativeSelect,
  Spinner,
} from '@git-manager/ui'
import { defaultColumnFor } from '../lib/cardMoveTargets'

interface MoveCardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Where the card may go — already filtered by `moveTargetsFor`. */
  targets: Board[]
  /** The column the card sits in now, which the target board's picker defaults to. */
  currentColumnId: string
  onSubmit: (targetBoardId: string, targetColumnId: string) => Promise<unknown>
}

/**
 * Moving a card to another board.
 *
 * One dialog for every direction, including local → GitHub, which used to be its own "convert to
 * issue" action. It was never a different operation: the card left one board and arrived on another,
 * and the only thing that made it look special was that arriving on a GitHub board means being an
 * issue. `useBoardCardActions.moveCardToBoard` picks the mechanism from the two boards' `source`.
 *
 * The column defaults to the one the card is in — see {@link defaultColumnFor} — because a move
 * between sprints is normally a move of *where the work lives*, not of how far along it is.
 */
export function MoveCardDialog({
  open,
  onOpenChange,
  targets,
  currentColumnId,
  onSubmit,
}: MoveCardDialogProps) {
  const { t } = useTranslation('board')
  const [boardId, setBoardId] = useState('')
  const [columnId, setColumnId] = useState('')
  const [pending, setPending] = useState(false)

  const selectedBoard = targets.find((b) => b.id === boardId)

  useEffect(() => {
    if (!open) return
    const first = targets[0]
    setBoardId(first?.id ?? '')
    setColumnId(first ? defaultColumnFor(first, currentColumnId) : '')
  }, [open, targets, currentColumnId])

  function handleBoardChange(nextBoardId: string) {
    setBoardId(nextBoardId)
    const next = targets.find((b) => b.id === nextBoardId)
    setColumnId(next ? defaultColumnFor(next, currentColumnId) : '')
  }

  async function handleSubmit() {
    if (!boardId || !columnId) return
    setPending(true)
    try {
      await onSubmit(boardId, columnId)
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
      <DialogContent data-testid="move-card-dialog">
        <DialogHeader>
          <DialogTitle>{t('moveCard.title')}</DialogTitle>
          <DialogDescription>
            {/* The consequence is stated only when it applies: on a GitHub board the card becomes a
                real issue, which is not something to discover after the fact. */}
            {selectedBoard?.source === 'remote'
              ? t('moveCard.descriptionRemote')
              : t('moveCard.description')}
          </DialogDescription>
        </DialogHeader>

        {targets.length === 0 ? (
          <p className="text-xs text-muted-foreground" data-testid="move-card-no-targets">
            {t('moveCard.noTargets')}
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="move-target-board">{t('moveCard.boardLabel')}</Label>
              <NativeSelect
                id="move-target-board"
                value={boardId}
                onChange={(e) => handleBoardChange(e.target.value)}
                disabled={pending}
                data-testid="move-target-board"
              >
                {targets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} · {t(`backend.${b.source}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="move-target-column">{t('moveCard.columnLabel')}</Label>
              <NativeSelect
                id="move-target-column"
                value={columnId}
                onChange={(e) => setColumnId(e.target.value)}
                disabled={pending || !selectedBoard}
                data-testid="move-target-column"
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
            disabled={pending || !boardId || !columnId}
            onClick={() => void handleSubmit()}
            data-testid="move-card-submit"
          >
            {pending && <Spinner className="h-3 w-3" />}
            {t('moveCard.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
