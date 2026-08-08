import { useTranslation } from '@git-manager/i18n'
import { X, RefreshCw, CalendarClock, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Button, Alert, Tooltip, LlmIcon } from '@git-manager/ui'
import { useDailySummary } from '../../../hooks/useDailySummary'

interface DailySummaryPanelProps {
  path: string
  onClose: () => void
}

/** Right-hand launchpad pane showing the AI "daily briefing" for one project: a headline, what was
 * landed on the main branch that day. Reads/generates via {@link useDailySummary}; the
 * generated result is persisted per-project so it survives reloads. */
export function DailySummaryPanel({ path, onClose }: DailySummaryPanelProps) {
  const { t, i18n } = useTranslation('dashboard')
  const { summary, generatedAt, isGenerating, progress, skipped, error, generate } =
    useDailySummary(path)

  const name = path.split('/').pop() || path

  const generatedLabel =
    generatedAt != null
      ? new Date(generatedAt).toLocaleString(i18n.language, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : null

  return (
    <div className="flex h-full w-full min-w-0 flex-col border-l border-border bg-card shadow-2xl">
      {/* Pane Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/10 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <LlmIcon className="h-4 w-4 shrink-0 text-primary" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-semibold text-foreground">
              {t('dashboard.summary.title')}
            </span>
            <span className="truncate text-[10px] text-muted-foreground">{name}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Tooltip content={t('dashboard.summary.regenerate')}>
            <Button
              variant="ghost"
              size="sm"
              className="flex h-7 items-center gap-1.5 px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => void generate()}
              disabled={isGenerating}
              aria-label={t('dashboard.summary.regenerate')}
              data-testid="daily-summary-refresh-button"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
              {/* Hidden below the `sm` breakpoint, so the aria-label above carries the name. */}
              <span className="hidden text-[11px] font-medium sm:inline">
                {t('dashboard.summary.regenerate')}
              </span>
            </Button>
          </Tooltip>
          <Tooltip content={t('dashboard.summary.close')}>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={t('dashboard.summary.close')}
              data-testid="daily-summary-close-button"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Pane content */}
      <div className="flex-1 select-text overflow-y-auto bg-card/10 p-5">
        {isGenerating ? (
          <div className="flex h-full flex-col items-center justify-center space-y-2 py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground" data-testid="daily-summary-progress">
              {progress?.phase === 'summarizing'
                ? t('dashboard.summary.summarizingFiles', {
                    completed: progress.completed,
                    total: progress.total,
                  })
                : progress?.phase === 'composing'
                  ? t('dashboard.summary.composing')
                  : t('dashboard.summary.generating')}
            </p>
          </div>
        ) : error ? (
          <Alert variant="destructive" className="flex-col items-start gap-2 rounded-lg">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {t('dashboard.summary.error')}
            </div>
            <p className="wrap-break-word font-mono text-[11px] opacity-80">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-1 h-7 text-xs"
              onClick={() => void generate()}
            >
              {t('dashboard.summary.retry')}
            </Button>
          </Alert>
        ) : skipped && !summary ? (
          /* Nothing landed on the main branch in the window — reported as its own state, because a
             quiet repository and a broken provider must not look the same. */
          <div
            className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center text-muted-foreground/70"
            data-testid="daily-summary-skipped"
          >
            <CalendarClock className="h-10 w-10 text-muted-foreground opacity-20" />
            <p className="max-w-[240px] text-xs leading-relaxed">
              {t('dashboard.summary.noChanges')}
            </p>
          </div>
        ) : summary ? (
          <div className="space-y-5" data-testid="daily-summary-content">
            {/* Headline */}
            {summary.headline && (
              <p className="text-sm font-medium leading-relaxed text-foreground">
                {summary.headline}
              </p>
            )}

            {generatedLabel && (
              <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
                <CalendarClock className="h-3 w-3" />
                {t('dashboard.summary.generatedAt', { when: generatedLabel })}
              </p>
            )}

            <SummarySection
              testid="daily-summary-highlights"
              icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
              title={t('dashboard.summary.highlights')}
              items={summary.highlights}
              emptyLabel={t('dashboard.summary.noHighlights')}
            />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center text-muted-foreground/70">
            <LlmIcon className="h-10 w-10 text-muted-foreground opacity-20" />
            <p className="max-w-[240px] text-xs leading-relaxed">{t('dashboard.summary.empty')}</p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => void generate()}
              data-testid="daily-summary-generate-button"
            >
              <LlmIcon className="mr-1.5 h-3.5 w-3.5" />
              {t('dashboard.summary.generate')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

interface SummarySectionProps {
  testid: string
  icon: React.ReactNode
  title: string
  items: string[]
  emptyLabel: string
}

function SummarySection({ testid, icon, title, items, emptyLabel }: SummarySectionProps) {
  return (
    <div className="space-y-2" data-testid={testid}>
      <div className="flex items-center gap-1.5 border-b border-border/40 pb-1">
        {icon}
        <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">{title}</h4>
      </div>
      {items.length === 0 ? (
        <p className="pl-1 text-[11px] italic text-muted-foreground/60">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/50" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
