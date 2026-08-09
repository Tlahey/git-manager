import { useEffect, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Label,
  NativeSelect,
  Spinner,
} from '@git-manager/ui'
import type { Board, BoardCard, SprintSummary } from '@git-manager/git-types'
import { computeSprintSummary, defaultArchiveColumnId, unfinishedCards } from '../lib/sprintStats'
import { nextSprintName } from '../lib/boardDefaults'
import { SprintSummaryView } from './SprintSummaryView'

interface CloseSprintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  board: Board
  cards: BoardCard[]
  onConfirm: (
    summary: SprintSummary,
    successor: { name: string; carryOverCardIds: string[] } | null,
    /** The column whose remaining cards are archived, or `null` to leave them on the closed sprint. */
    archiveColumnId: string | null
  ) => Promise<unknown>
}

/**
 * Ends a sprint: shows what it achieved, then offers to open its successor and move the leftovers
 * into it.
 *
 * The summary is computed here, once, from the cards as they stand — and handed to the backend to be
 * stored rather than recomputed later, because the carry-over that happens moments afterwards takes
 * the unfinished cards away with it.
 */
export function CloseSprintDialog({
  open,
  onOpenChange,
  board,
  cards,
  onConfirm,
}: CloseSprintDialogProps) {
  const { t } = useTranslation('board')
  const [carryOver, setCarryOver] = useState(true)
  const [nextName, setNextName] = useState('')
  const [archiveDone, setArchiveDone] = useState(true)
  const [archiveColumnId, setArchiveColumnId] = useState('')
  const [pending, setPending] = useState(false)

  const leftovers = unfinishedCards(cards, board.columns)
  const summary = computeSprintSummary(board.columns, cards, new Date().toISOString())

  const orderedColumns = [...board.columns].sort((a, b) => a.order - b.order)
  // What archiving would actually take: the chosen column's cards that are still on the board. The
  // count is what makes the checkbox mean something — "archive the finished cards" over an empty
  // column is a promise about nothing.
  const archivable = cards.filter((c) => c.columnId === archiveColumnId && !c.archivedAt)

  useEffect(() => {
    if (!open) return
    setCarryOver(true)
    setNextName(nextSprintName(board.name))
    setArchiveDone(true)
    setArchiveColumnId(defaultArchiveColumnId(board.columns))
  }, [open, board.name, board.columns])

  async function handleConfirm() {
    setPending(true)
    try {
      await onConfirm(
        summary,
        carryOver && nextName.trim()
          ? { name: nextName.trim(), carryOverCardIds: leftovers.map((card) => card.id) }
          : null,
        archiveDone && archiveColumnId ? archiveColumnId : null
      )
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
      {/* The sprint report is a set of breakdown tables — per column, per priority, per assignee. */}
      <DialogContent
        data-testid="close-sprint-dialog"
        size="lg"
        className="max-h-[85vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{t('sprint.closeTitle', { name: board.name })}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <SprintSummaryView summary={summary} />

          <div className="space-y-2 rounded border border-border bg-card/40 p-2.5">
            <label className="flex cursor-pointer items-start gap-2 text-xs">
              <Checkbox
                checked={carryOver}
                onChange={(e) => setCarryOver(e.target.checked)}
                disabled={pending}
                data-testid="close-sprint-carry-over"
              />
              <span className="font-medium text-foreground">{t('sprint.carryOverLabel')}</span>
            </label>
            <p className="text-[11px] text-muted-foreground" data-testid="close-sprint-carry-hint">
              {leftovers.length === 0
                ? t('sprint.carryOverNoneHint')
                : t('sprint.carryOverHint', { count: leftovers.length })}
            </p>

            {carryOver && (
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  {t('sprint.nextNameLabel')}
                </Label>
                <Input
                  value={nextName}
                  onChange={(e) => setNextName(e.target.value)}
                  disabled={pending}
                  className="h-8 text-xs"
                  data-testid="close-sprint-next-name"
                />
              </div>
            )}
          </div>

          {/* Carry-over takes the *unfinished* work forward; this puts what stayed behind away, so a
              closed sprint's board isn't left holding every ticket it ever completed. */}
          <div className="space-y-2 rounded border border-border bg-card/40 p-2.5">
            <label className="flex cursor-pointer items-start gap-2 text-xs">
              <Checkbox
                checked={archiveDone}
                onChange={(e) => setArchiveDone(e.target.checked)}
                disabled={pending}
                data-testid="close-sprint-archive-done"
              />
              <span className="font-medium text-foreground">{t('sprint.archiveDoneLabel')}</span>
            </label>
            <p className="text-[11px] text-muted-foreground" data-testid="close-sprint-archive-hint">
              {t('sprint.archiveDoneHint', { count: archivable.length })}
            </p>

            {archiveDone && (
              <div className="space-y-1">
                {/* Which column holds "finished" is the board's own decision, not this dialog's — it
                    defaults to the one flagged done and is shown so a board that never set the flag
                    can say where its finished work actually sits. */}
                <Label
                  className="text-[11px] text-muted-foreground"
                  htmlFor="close-sprint-archive-column"
                >
                  {t('sprint.archiveColumnLabel')}
                </Label>
                <NativeSelect
                  id="close-sprint-archive-column"
                  value={archiveColumnId}
                  onChange={(e) => setArchiveColumnId(e.target.value)}
                  disabled={pending}
                  className="h-8 text-xs"
                  data-testid="close-sprint-archive-column"
                >
                  {orderedColumns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => onOpenChange(false)}>
            {t('card.dialog.cancel')}
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={pending || (carryOver && !nextName.trim())}
            onClick={() => void handleConfirm()}
            data-testid="close-sprint-confirm"
          >
            {pending && <Spinner className="h-3 w-3" />}
            {t('sprint.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
