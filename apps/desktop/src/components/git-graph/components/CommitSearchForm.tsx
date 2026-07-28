import { useTranslation } from '@git-manager/i18n'
import { Button, Checkbox, Input, Textarea } from '@git-manager/ui'
import { Search, Square } from 'lucide-react'

interface CommitSearchFormProps {
  question: string
  onQuestionChange: (question: string) => void
  maxCommits: number
  onMaxCommitsChange: (max: number) => void
  quick: boolean
  onQuickChange: (quick: boolean) => void
  isRunning: boolean
  onSubmit: () => void
  onCancel: () => void
}

/**
 * The question, how many commits to read, and whether to read them or only their messages.
 *
 * **Two controls, and they are not the same kind of thing.** The count bounds how much history is
 * looked at; the quick toggle decides what "looked at" means, and that is a different question with a
 * different answer — one reads what the commits *did*, the other what their authors *said* they did.
 * A `fix: review feedback` that rewrote the button is invisible to one and found by the other, so
 * neither can be the app's choice to make silently.
 *
 * There used to be a time *window* beside the count, and it was redundant: the scan stops at whichever
 * bound it meets first, the count is the one that must bind because it is what the run costs, and the
 * window could only ever shrink the result below what was asked for — while announcing itself with a
 * warning that fired exactly when it had done nothing.
 *
 * Both controls are on screen rather than buried in settings because both decide how long the search
 * takes, by two orders of magnitude between them.
 */
export function CommitSearchForm({
  question,
  onQuestionChange,
  maxCommits,
  onMaxCommitsChange,
  quick,
  onQuickChange,
  isRunning,
  onSubmit,
  onCancel,
}: CommitSearchFormProps) {
  const { t } = useTranslation('git')

  return (
    <div className="flex flex-col gap-2" data-testid="commit-search-form">
      <Textarea
        value={question}
        onChange={(e) => onQuestionChange(e.target.value)}
        onKeyDown={(e) => {
          // Enter asks; Shift+Enter is a newline, since a question can be a couple of sentences.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (!isRunning && question.trim()) onSubmit()
          }
        }}
        rows={2}
        placeholder={t('gitTree.commitSearch.questionPlaceholder')}
        className="min-h-0 resize-none text-xs"
        data-testid="commit-search-question"
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <label className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">
            {t('gitTree.commitSearch.maxCommitsLabel')}
          </span>
          <Input
            type="number"
            inputSize="sm"
            min={1}
            max={500}
            value={maxCommits}
            onChange={(e) => onMaxCommitsChange(Number(e.target.value))}
            className="h-6 w-16 px-1.5 text-[10px] tabular-nums"
            data-testid="commit-search-max-commits"
          />
        </label>

        <label className="flex cursor-pointer items-center gap-1.5">
          <Checkbox
            checked={quick}
            onChange={(e) => onQuickChange(e.target.checked)}
            className="h-3.5 w-3.5"
            data-testid="commit-search-quick"
          />
          <span className="text-[10px] text-muted-foreground">
            {t('gitTree.commitSearch.quickLabel')}
          </span>
        </label>
      </div>

      <div className="flex items-center justify-between gap-2">
        {/* The cost line changes with the mode because the two costs differ by orders of magnitude,
            and because "seconds" versus "minutes" is what the toggle is really offering. */}
        <p className="text-[10px] text-muted-foreground">
          {quick
            ? t('gitTree.commitSearch.quickHint', { count: maxCommits })
            : t('gitTree.commitSearch.costHint', { count: maxCommits })}
        </p>
        {isRunning ? (
          <Button
            variant="outline"
            size="sm"
            className="h-6 shrink-0 gap-1 px-2 text-[10px] font-bold"
            onClick={onCancel}
            data-testid="commit-search-stop"
          >
            <Square className="h-3 w-3" />
            {t('gitTree.explanation.stop')}
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-6 shrink-0 gap-1 px-2 text-[10px] font-bold"
            onClick={onSubmit}
            disabled={!question.trim()}
            data-testid="commit-search-submit"
          >
            <Search className="h-3 w-3" />
            {t('gitTree.commitSearch.ask')}
          </Button>
        )}
      </div>
    </div>
  )
}
