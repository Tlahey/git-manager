import { useTranslation } from '@git-manager/i18n'
import { Tooltip } from '@git-manager/ui'
import { CheckCircle2, RefreshCw, AlertTriangle, GitBranch } from 'lucide-react'
import type { GitRepoSummary } from '@git-manager/git-types'

interface RepoRowStatusProps {
  summary: GitRepoSummary | undefined
  isLoading: boolean
  hasError: boolean
}

/** A single change counter, e.g. `+12` staged. Rendered only when the count is non-zero. */
function CountBadge({
  count,
  prefix,
  label,
  className,
  testId,
}: {
  count: number
  prefix: string
  label: string
  className: string
  testId: string
}) {
  if (count === 0) return null
  return (
    <Tooltip content={`${count} ${label}`}>
      <span
        data-testid={testId}
        className={`rounded px-1.5 py-0.5 font-mono text-[10px] leading-none font-medium ${className}`}
      >
        {prefix}
        {count}
      </span>
    </Tooltip>
  )
}

/**
 * The branch + working-tree columns of a dashboard row: the checked-out branch, then the staged /
 * unstaged / untracked / conflicted counters and the ahead-behind pair. A clean repo collapses to a
 * single check mark so a tidy list stays visually quiet.
 */
export function RepoRowStatus({ summary, isLoading, hasError }: RepoRowStatusProps) {
  const { t } = useTranslation('dashboard')

  if (isLoading) {
    return (
      <div
        data-testid="repo-row-status-loading"
        className="flex items-center gap-1.5 text-muted-foreground/40"
      >
        <RefreshCw className="h-3 w-3 animate-spin" />
        <span className="font-mono text-[10px]">{t('dashboard.row.loading')}</span>
      </div>
    )
  }

  if (hasError) {
    return (
      <span
        data-testid="repo-row-status-error"
        className="flex items-center gap-1 rounded border border-destructive/20 bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] text-destructive/80"
      >
        <AlertTriangle className="h-3 w-3 shrink-0" />
        {t('dashboard.invalidRepo')}
      </span>
    )
  }

  if (!summary) return null

  const isClean =
    summary.stagedCount === 0 &&
    summary.unstagedCount === 0 &&
    summary.untrackedCount === 0 &&
    summary.conflictedCount === 0

  return (
    <div data-testid="repo-row-status" className="flex items-center gap-3">
      <Tooltip content={summary.head}>
        <div className="flex shrink-0 items-center gap-1 rounded-md border border-border/30 bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
          <GitBranch className="h-3 w-3 shrink-0 text-primary/60" />
          <span data-testid="repo-row-branch" className="max-w-[110px] truncate">
            {summary.head}
          </span>
        </div>
      </Tooltip>

      <div className="flex shrink-0 items-center gap-1.5">
        <CountBadge
          count={summary.conflictedCount}
          prefix="!"
          label={t('dashboard.conflictedChanges')}
          testId="repo-row-conflicted"
          className="animate-pulse border border-red-500/25 bg-red-500/10 font-semibold text-red-500"
        />
        <CountBadge
          count={summary.stagedCount}
          prefix="+"
          label={t('dashboard.stagedChanges')}
          testId="repo-row-staged"
          className="border border-emerald-500/25 bg-emerald-500/10 text-emerald-500"
        />
        <CountBadge
          count={summary.unstagedCount}
          prefix="~"
          label={t('dashboard.unstagedChanges')}
          testId="repo-row-unstaged"
          className="border border-amber-500/25 bg-amber-500/10 text-amber-500"
        />
        <CountBadge
          count={summary.untrackedCount}
          prefix="?"
          label={t('dashboard.untrackedChanges')}
          testId="repo-row-untracked"
          className="border border-border bg-muted text-muted-foreground"
        />

        {(summary.aheadCount > 0 || summary.behindCount > 0) && (
          <Tooltip
            content={t('dashboard.aheadBehind', {
              ahead: summary.aheadCount,
              behind: summary.behindCount,
            })}
          >
            <div
              data-testid="repo-row-sync"
              className="flex shrink-0 items-center gap-1 rounded border border-primary/10 bg-primary/5 px-1.5 py-0.5 font-mono text-[10px] leading-none"
            >
              {summary.aheadCount > 0 && (
                <span className="font-semibold text-emerald-500">↑{summary.aheadCount}</span>
              )}
              {summary.behindCount > 0 && (
                <span className="font-semibold text-amber-500">↓{summary.behindCount}</span>
              )}
            </div>
          </Tooltip>
        )}

        {isClean && (
          <Tooltip content={t('dashboard.row.clean')}>
            <span data-testid="repo-row-clean">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500/80" />
            </span>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
