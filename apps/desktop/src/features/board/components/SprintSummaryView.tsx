import { useTranslation } from '@git-manager/i18n'
import { Progress } from '@git-manager/ui'
import type { SprintSummary } from '@git-manager/git-types'

interface SprintSummaryViewProps {
  summary: SprintSummary
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'bad' }) {
  return (
    <div className="rounded border border-border bg-card/40 px-2 py-1.5">
      <p className="text-[10px] tracking-wide text-muted-foreground uppercase">{label}</p>
      <p
        className={`text-sm font-semibold ${tone === 'bad' ? 'text-destructive' : 'text-foreground'}`}
      >
        {value}
      </p>
    </div>
  )
}

/**
 * A sprint's report, rendered from a {@link SprintSummary} and nothing else.
 *
 * It takes the summary rather than the board's live cards on purpose: closing a sprint *moves* the
 * unfinished cards to its successor, so recomputing from what remains would flatter the sprint. The
 * same component therefore serves the confirmation dialog (a summary computed a moment ago) and an
 * archived board (a summary frozen months ago).
 */
export function SprintSummaryView({ summary }: SprintSummaryViewProps) {
  const { t } = useTranslation('board')

  return (
    <div className="space-y-3" data-testid="sprint-summary">
      <div className="grid grid-cols-3 gap-2">
        <Stat label={t('sprint.stat.total')} value={summary.totalCards} />
        <Stat label={t('sprint.stat.done')} value={summary.doneCards} />
        <Stat label={t('sprint.stat.unfinished')} value={summary.unfinishedCards} />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">{t('sprint.stat.completion')}</span>
          <span className="font-semibold text-foreground" data-testid="sprint-completion">
            {summary.completionRate}%
          </span>
        </div>
        <Progress value={summary.completionRate} className="h-1.5" />
      </div>

      {(summary.blockedCards > 0 || summary.overdueCards > 0) && (
        <div className="grid grid-cols-2 gap-2">
          <Stat
            label={t('sprint.stat.blocked')}
            value={summary.blockedCards}
            tone={summary.blockedCards > 0 ? 'bad' : undefined}
          />
          <Stat
            label={t('sprint.stat.overdue')}
            value={summary.overdueCards}
            tone={summary.overdueCards > 0 ? 'bad' : undefined}
          />
        </div>
      )}

      <div className="space-y-1">
        <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
          {t('sprint.byColumn')}
        </p>
        <ul className="space-y-0.5 text-[11px]" data-testid="sprint-by-column">
          {summary.byColumn.map((entry) => (
            <li key={entry.columnId} className="flex justify-between">
              <span className="text-muted-foreground">{entry.columnName}</span>
              <span className="font-medium text-foreground">{entry.count}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-1">
        <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
          {t('sprint.byPriority')}
        </p>
        <ul className="space-y-0.5 text-[11px]" data-testid="sprint-by-priority">
          {summary.byPriority.map((entry) => (
            <li key={entry.priority} className="flex justify-between">
              <span className="text-muted-foreground">{t(`card.priority.${entry.priority}`)}</span>
              <span className="font-medium text-foreground">{entry.count}</span>
            </li>
          ))}
        </ul>
      </div>

      {summary.byAssignee.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
            {t('sprint.byAssignee')}
          </p>
          <ul className="space-y-0.5 text-[11px]" data-testid="sprint-by-assignee">
            {summary.byAssignee.map((entry) => (
              <li key={entry.assignee} className="flex justify-between">
                <span className="text-muted-foreground">{entry.assignee}</span>
                <span className="font-medium text-foreground">
                  {t('sprint.assigneeDone', { done: entry.done, total: entry.total })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.carriedOverToBoardId && (
        <p className="text-[11px] text-muted-foreground" data-testid="sprint-carried-over">
          {t('sprint.carriedOver')}
        </p>
      )}
    </div>
  )
}
