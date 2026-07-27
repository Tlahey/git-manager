import { useTranslation } from '@git-manager/i18n'
import { X, RefreshCw } from 'lucide-react'
import { Input, Button, Tooltip, LlmIcon } from '@git-manager/ui'

interface SummaryDayPickerProps {
  /** The day being explored, `YYYY-MM-DD`, or `''` for "show the whole archive". */
  date: string
  onDateChange: (date: string) => void
  onClear: () => void
  onGenerate: () => void
  /** Latest day that can be summarized — a day that hasn't happened has no commits. */
  maxDate: string
  isGenerating: boolean
  /** False when the AI provider is off; the button explains itself instead of failing on click. */
  aiEnabled: boolean
  /** Progress line while the two-phase run is in flight, or `null`. */
  progressLabel: string | null
}

/**
 * Pick a day, then summarize it.
 *
 * One date, not a range: a briefing is about the work of a single day, so a range could only ever
 * select which *existing* briefings to list — it could never say which one to generate. Putting the
 * generate button beside the field is what makes that one control: the date is the argument, and
 * generation is disabled until it has one.
 *
 * An empty date is the resting state and lists the whole archive; picking a day narrows to it, which
 * is also where you land when you click a day the model cited in its answer.
 */
export function SummaryDayPicker({
  date,
  onDateChange,
  onClear,
  onGenerate,
  maxDate,
  isGenerating,
  aiEnabled,
  progressLabel,
}: SummaryDayPickerProps) {
  const { t } = useTranslation('dashboard')
  const canGenerate = date !== '' && aiEnabled && !isGenerating

  return (
    <div
      className="flex flex-col gap-1.5 border-b border-border bg-card/40 px-3 py-2"
      data-testid="summary-day-picker"
    >
      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          value={date}
          max={maxDate}
          onChange={(e) => onDateChange(e.target.value)}
          aria-label={t('summaries.day')}
          className="h-7 flex-1 text-[11px]"
          data-testid="summary-day-input"
        />
        <Tooltip
          content={date === '' ? t('summaries.pickADayFirst') : t('summaries.generateForDay')}
        >
          {/* Wrapped because a disabled button fires no pointer events, so the tooltip explaining
              *why* it is disabled would never appear on the element itself. `inline-flex` so the
              wrapper's box matches the button's — a plain inline span picks up line-height padding
              and the tooltip would sit a few pixels off. */}
          <span className="inline-flex">
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0 px-2 text-[11px]"
              onClick={onGenerate}
              disabled={!canGenerate}
              aria-label={t('summaries.generateForDay')}
              data-testid="summary-generate-button"
            >
              {isGenerating ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LlmIcon className="h-3.5 w-3.5" />
              )}
            </Button>
          </span>
        </Tooltip>
        {date !== '' && !isGenerating && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 shrink-0 p-0"
            onClick={onClear}
            aria-label={t('summaries.clearDay')}
            data-testid="summary-clear-day"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {progressLabel && (
        <p
          className="flex items-center gap-1.5 text-[10px] text-muted-foreground"
          data-testid="summary-generate-progress"
        >
          {progressLabel}
        </p>
      )}
      {!aiEnabled && (
        <p className="text-[10px] text-muted-foreground">{t('summaries.askDisabled')}</p>
      )}
    </div>
  )
}
