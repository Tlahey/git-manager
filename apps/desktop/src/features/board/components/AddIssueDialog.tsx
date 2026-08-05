import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import type { BoardColumn } from '@git-manager/git-types'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
  Label,
  NativeSelect,
  ScrollArea,
  Spinner,
} from '@git-manager/ui'
import { CircleDot, Hash } from 'lucide-react'
import { parseIssueReference } from '../api/trackedIssueMapping'
import { useRepoOpenIssues } from '../../../hooks/useRepoOpenIssues'

interface AddIssueDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  repoPath: string
  columns: BoardColumn[]
  /** Issues already tracked by a card on this board — offered but not selectable, so "why isn't it
   * in the list?" never becomes the question. */
  trackedIssueNumbers?: number[]
  onSubmit: (issueNumber: number, columnId: string) => Promise<unknown>
}

/**
 * "Add an issue to the board": pick one of the repo's open issues, or paste a reference.
 *
 * Both, rather than either: the list is what you want when you're browsing, and a pasted number or
 * URL is what you want when you already know which issue — including a *closed* one, which the list
 * deliberately doesn't carry (see `useRepoOpenIssues`). So the search box doubles as the reference
 * field, and anything that parses as one offers itself as an extra row above the results.
 *
 * On a local board the result is a **tracked** card — see `useBoardData.addIssueToBoard`.
 */
export function AddIssueDialog({
  open,
  onOpenChange,
  repoPath,
  columns,
  trackedIssueNumbers = [],
  onSubmit,
}: AddIssueDialogProps) {
  const { t } = useTranslation('board')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [columnId, setColumnId] = useState(columns[0]?.id ?? '')
  const [pending, setPending] = useState(false)

  const { issues, isLoading } = useRepoOpenIssues(repoPath, open)

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(null)
      setColumnId(columns[0]?.id ?? '')
    }
  }, [open, columns])

  const pasted = parseIssueReference(query)
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const pool = needle
      ? issues.filter(
          (i) => i.title.toLowerCase().includes(needle) || String(i.number).includes(needle)
        )
      : issues
    return pool.slice(0, 50)
  }, [issues, query])

  const isTaken = (n: number) => trackedIssueNumbers.includes(n)

  // A pasted reference that isn't in the open-issue list still has to be choosable — that is the
  // whole point of accepting one.
  const showPastedRow = pasted !== null && !matches.some((i) => i.number === pasted)
  // A pasted reference to an issue already on the board is shown, but doesn't auto-select: it has to
  // read as "this one, and it's taken" rather than as an unexplained disabled button.
  const chosen = selected ?? (showPastedRow && !isTaken(pasted) ? pasted : null)

  async function handleSubmit() {
    if (chosen === null || !columnId) return
    setPending(true)
    try {
      await onSubmit(chosen, columnId)
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
      {/* `lg`, because the content is a list of issue titles — at the default width they were
          truncated to a few words, which is not enough to tell two issues apart. `overflow-hidden`
          still matters: a single very long title must clip rather than widen the dialog past the
          size chosen here. */}
      <DialogContent data-testid="add-issue-dialog" size="lg" className="overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t('addIssue.title')}</DialogTitle>
          <DialogDescription>{t('addIssue.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="add-issue-search">{t('addIssue.searchLabel')}</Label>
            <Input
              id="add-issue-search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setSelected(null)
              }}
              placeholder={t('addIssue.searchPlaceholder')}
              disabled={pending}
              autoFocus
              data-testid="add-issue-search-input"
            />
          </div>

          <ScrollArea className="h-56 rounded-md border border-border">
            <div className="p-1" data-testid="add-issue-results">
              {showPastedRow && (
                <IssueRow
                  key={`pasted-${pasted}`}
                  number={pasted}
                  title={
                    isTaken(pasted)
                      ? t('addIssue.alreadyOnBoardRow')
                      : t('addIssue.usePastedReference')
                  }
                  selected={chosen === pasted}
                  taken={isTaken(pasted)}
                  onSelect={() => setSelected(pasted)}
                  testId="add-issue-pasted"
                />
              )}

              {isLoading && (
                <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                  <Spinner className="h-3 w-3" /> {t('addIssue.loading')}
                </div>
              )}

              {!isLoading && matches.length === 0 && !showPastedRow && (
                <p className="p-3 text-xs text-muted-foreground" data-testid="add-issue-empty">
                  {t('addIssue.noResults')}
                </p>
              )}

              {matches.map((issue) => (
                <IssueRow
                  key={issue.number}
                  number={issue.number}
                  title={issue.title}
                  selected={chosen === issue.number}
                  taken={isTaken(issue.number)}
                  onSelect={() => setSelected(issue.number)}
                  testId={`add-issue-option-${issue.number}`}
                />
              ))}
            </div>
          </ScrollArea>

          <div className="space-y-1.5">
            <Label htmlFor="add-issue-column">{t('addIssue.columnLabel')}</Label>
            <NativeSelect
              id="add-issue-column"
              value={columnId}
              onChange={(e) => setColumnId(e.target.value)}
              disabled={pending}
              data-testid="add-issue-column"
            >
              {columns.map((c) => (
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
            disabled={pending || chosen === null || !columnId}
            onClick={() => void handleSubmit()}
            data-testid="add-issue-submit"
          >
            {pending && <Spinner className="h-3 w-3" />}
            {t('addIssue.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function IssueRow({
  number,
  title,
  selected,
  taken,
  onSelect,
  testId,
}: {
  number: number
  title: string
  selected: boolean
  /** Already tracked by a card on this board — shown, but not selectable. */
  taken?: boolean
  onSelect: () => void
  testId: string
}) {
  const { t } = useTranslation('board')
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={taken}
      aria-pressed={selected}
      data-testid={testId}
      className={`flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
        taken ? 'cursor-not-allowed opacity-50' : 'hover:bg-muted'
      } ${selected ? 'bg-muted' : ''}`}
    >
      {testId === 'add-issue-pasted' ? (
        <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <CircleDot className="h-3.5 w-3.5 shrink-0 text-tone-success" />
      )}
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">#{number}</span>
      {/* `min-w-0` is what makes `truncate` actually truncate: a flex item defaults to
          `min-width: auto`, so a long issue title refuses to shrink and pushes the dialog wider than
          its own max width. */}
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {taken && (
        <span className="shrink-0 rounded bg-muted px-1 py-px text-[9px] uppercase tracking-wide text-muted-foreground">
          {t('addIssue.onBoardBadge')}
        </span>
      )}
    </button>
  )
}
