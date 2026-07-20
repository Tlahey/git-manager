import { useTranslation } from '@git-manager/i18n'
import { Sparkles, X, RefreshCw, CalendarClock, CheckCircle2, ListTodo, AlertTriangle } from 'lucide-react'
import { Button, Alert } from '@git-manager/ui'
import { useDailySummary } from '../../../hooks/useDailySummary'

interface DailySummaryPanelProps {
  path: string
  onClose: () => void
}

/** Right-hand launchpad pane showing the AI "daily briefing" for one project: a headline, what was
 * done ("yesterday"), and what to plan ("today"). Reads/generates via {@link useDailySummary}; the
 * generated result is persisted per-project so it survives reloads. */
export function DailySummaryPanel({ path, onClose }: DailySummaryPanelProps) {
  const { t, i18n } = useTranslation('dashboard')
  const { summary, generatedAt, isGenerating, error, generate } = useDailySummary(path)

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
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-semibold text-foreground">
              {t('dashboard.summary.title') || 'Briefing du jour'}
            </span>
            <span className="truncate text-[10px] text-muted-foreground">{name}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="flex h-7 items-center gap-1.5 px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={generate}
            disabled={isGenerating}
            title={t('dashboard.summary.regenerate') || 'Régénérer'}
            data-testid="daily-summary-refresh-button"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
            <span className="hidden text-[11px] font-medium sm:inline">
              {t('dashboard.summary.regenerate') || 'Régénérer'}
            </span>
          </Button>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={t('dashboard.summary.close') || 'Fermer'}
            data-testid="daily-summary-close-button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Pane content */}
      <div className="flex-1 select-text overflow-y-auto bg-card/10 p-5">
        {isGenerating && !summary ? (
          <div className="flex h-full flex-col items-center justify-center space-y-2 py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">
              {t('dashboard.summary.generating') || 'Génération du briefing...'}
            </p>
          </div>
        ) : error ? (
          <Alert variant="destructive" className="flex-col items-start gap-2 rounded-lg">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {t('dashboard.summary.error') || 'Impossible de générer le briefing'}
            </div>
            <p className="break-words font-mono text-[11px] opacity-80">{error}</p>
            <Button variant="outline" size="sm" className="mt-1 h-7 text-xs" onClick={generate}>
              {t('dashboard.summary.retry') || 'Réessayer'}
            </Button>
          </Alert>
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
                {t('dashboard.summary.generatedAt', { when: generatedLabel }) ||
                  `Généré le ${generatedLabel}`}
              </p>
            )}

            {/* Yesterday */}
            <SummarySection
              testid="daily-summary-yesterday"
              icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
              title={t('dashboard.summary.yesterday') || 'Hier'}
              items={summary.yesterday}
              emptyLabel={t('dashboard.summary.noYesterday') || 'Aucune activité récente.'}
            />

            {/* Today */}
            <SummarySection
              testid="daily-summary-today"
              icon={<ListTodo className="h-3.5 w-3.5 text-primary" />}
              title={t('dashboard.summary.today') || "Aujourd'hui"}
              items={summary.today}
              emptyLabel={t('dashboard.summary.noToday') || 'Rien de suggéré.'}
            />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center text-muted-foreground/70">
            <Sparkles className="h-10 w-10 text-muted-foreground opacity-20" />
            <p className="max-w-[240px] text-xs leading-relaxed">
              {t('dashboard.summary.empty') ||
                'Générez un briefing pour voir ce qui a été fait et ce qui pourrait être planifié.'}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={generate}
              data-testid="daily-summary-generate-button"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              {t('dashboard.summary.generate') || 'Générer'}
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
