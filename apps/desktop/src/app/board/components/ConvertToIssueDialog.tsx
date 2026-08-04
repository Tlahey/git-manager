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

interface ConvertToIssueDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  remoteBoards: Board[]
  onSubmit: (targetBoardId: string, targetColumnId: string) => Promise<unknown>
}

/** "Convert to GitHub issue" — a local card only (a remote card already is one): pick which remote
 * board + column the new issue lands in. Creating the issue and removing the local card both happen
 * in `useBoardData.convertCardToIssue`. */
export function ConvertToIssueDialog({
  open,
  onOpenChange,
  remoteBoards,
  onSubmit,
}: ConvertToIssueDialogProps) {
  const { t } = useTranslation('board')
  const [boardId, setBoardId] = useState(remoteBoards[0]?.id ?? '')
  const [columnId, setColumnId] = useState(remoteBoards[0]?.columns[0]?.id ?? '')
  const [pending, setPending] = useState(false)

  const selectedBoard = remoteBoards.find((b) => b.id === boardId)

  useEffect(() => {
    if (!open) return
    const first = remoteBoards[0]
    setBoardId(first?.id ?? '')
    setColumnId(first?.columns[0]?.id ?? '')
  }, [open, remoteBoards])

  function handleBoardChange(nextBoardId: string) {
    setBoardId(nextBoardId)
    setColumnId(remoteBoards.find((b) => b.id === nextBoardId)?.columns[0]?.id ?? '')
  }

  async function handleSubmit() {
    if (!boardId || !columnId) return
    setPending(true)
    try {
      await onSubmit(boardId, columnId)
      onOpenChange(false)
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="convert-to-issue-dialog">
        <DialogHeader>
          <DialogTitle>{t('convertToIssue.title')}</DialogTitle>
          <DialogDescription>{t('convertToIssue.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="convert-target-board">{t('convertToIssue.boardLabel')}</Label>
            <NativeSelect
              id="convert-target-board"
              value={boardId}
              onChange={(e) => handleBoardChange(e.target.value)}
              disabled={pending}
              data-testid="convert-target-board"
            >
              {remoteBoards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="convert-target-column">{t('convertToIssue.columnLabel')}</Label>
            <NativeSelect
              id="convert-target-column"
              value={columnId}
              onChange={(e) => setColumnId(e.target.value)}
              disabled={pending || !selectedBoard}
              data-testid="convert-target-column"
            >
              {(selectedBoard?.columns ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => onOpenChange(false)}>
            {t('card.dialog.cancel')}
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={pending || !boardId || !columnId}
            onClick={() => void handleSubmit()}
            data-testid="convert-to-issue-submit"
          >
            {pending && <Spinner className="h-3 w-3" />}
            {t('convertToIssue.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
