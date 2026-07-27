import { useTranslation } from '@git-manager/i18n'
import { Button, Input, NativeSelect, Textarea } from '@git-manager/ui'
import { Search, Square } from 'lucide-react'
import { SEARCH_WINDOWS_HOURS } from '../../../hooks/useAiCommitSearch'

interface CommitSearchFormProps {
  question: string
  onQuestionChange: (question: string) => void
  sinceHours: number
  onSinceHoursChange: (hours: number) => void
  maxCommits: number
  onMaxCommitsChange: (max: number) => void
  isRunning: boolean
  onSubmit: () => void
  onCancel: () => void
}

/** Label key for a window length, so the module-level map holds keys rather than English. */
const WINDOW_LABELS: Record<number, string> = {
  [24 * 7]: 'gitTree.commitSearch.window7d',
  [24 * 30]: 'gitTree.commitSearch.window30d',
  [24 * 90]: 'gitTree.commitSearch.window90d',
}

/**
 * The question, the window it is asked over, and how many commits may be read.
 *
 * The commit cap is on screen rather than buried in settings because it is the only control that
 * decides how long the search takes: each commit is one model call, so raising it from sixty to two
 * hundred is the difference between a coffee and an afternoon. Showing it next to the button is what
 * makes that a choice instead of a surprise.
 */
export function CommitSearchForm({
  question,
  onQuestionChange,
  sinceHours,
  onSinceHoursChange,
  maxCommits,
  onMaxCommitsChange,
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

      <div className="flex items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {t('gitTree.commitSearch.windowLabel')}
          </span>
          <NativeSelect
            value={sinceHours}
            onChange={(e) => onSinceHoursChange(Number(e.target.value))}
            className="h-6 px-1.5 text-[10px]"
            data-testid="commit-search-window"
          >
            {SEARCH_WINDOWS_HOURS.map((hours) => (
              <option key={hours} value={hours}>
                {t(WINDOW_LABELS[hours])}
              </option>
            ))}
          </NativeSelect>
        </label>

        <label className="flex shrink-0 items-center gap-1.5">
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
            className="h-6 w-14 px-1.5 text-[10px] tabular-nums"
            data-testid="commit-search-max-commits"
          />
        </label>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-muted-foreground">
          {t('gitTree.commitSearch.costHint', { count: maxCommits })}
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
