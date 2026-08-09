import { ArrowUpCircle, LayoutList, RefreshCw } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { Alert, Badge, Button, ScrollArea, Spinner } from '@git-manager/ui'
import { usePackageHealth } from '../../hooks/usePackageHealth'
import { usePackageHealthStore } from '../../stores/packageHealth.store'
import { SEVERITY_PRESENTATION, failingChecks } from './healthSeverity'

/**
 * Right panel of the package health workspace: a summary header over the list of
 * checks. Selecting one hands the center pane its findings; the report itself
 * lives there, so this stays a navigable index rather than a second report.
 */
export function PackageHealthPanel({ repoPath }: { repoPath: string }) {
  const { t } = useTranslation('git')
  const { data: report, error, isLoading, mutate } = usePackageHealth(repoPath)
  const selection = usePackageHealthStore((s) => s.selection)
  const select = usePackageHealthStore((s) => s.select)

  const failing = report ? failingChecks(report.checks) : []

  return (
    <div
      className="flex h-full w-full min-w-0 flex-col border-l border-border bg-card"
      data-testid="package-health-panel"
    >
      <div className="space-y-2 border-b border-border p-2">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs font-medium">{t('health.title')}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => mutate()}
            disabled={isLoading}
            aria-label={t('health.run')}
            title={t('health.run')}
            data-testid="package-health-refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {report && (
          <p className="text-[11px] text-muted-foreground" data-testid="package-health-summary">
            {t('health.summary.packages', { count: report.packages.length })} ·{' '}
            {t('health.summary.dependencies', { count: report.dependencyCount })} ·{' '}
            {report.packageManager}
          </p>
        )}

        {report && (
          <Alert
            variant={failing.length === 0 ? 'success' : 'warning'}
            data-testid="package-health-verdict"
          >
            <span className="text-[11px]">
              {failing.length === 0
                ? t('health.summary.allClear')
                : t('health.summary.problems', { count: failing.length })}
            </span>
          </Alert>
        )}

        {error != null && (
          <Alert variant="destructive" data-testid="package-health-error">
            <pre className="font-mono text-[11px] whitespace-pre-wrap">{String(error)}</pre>
          </Alert>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {isLoading ? (
          <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
            <Spinner className="h-4 w-4" />
            {t('health.loading')}
          </div>
        ) : report == null ? null : (
          <div className="p-1">
            <button
              type="button"
              onClick={() => select({ kind: 'overview' })}
              data-testid="health-check-overview"
              aria-current={selection.kind === 'overview'}
              className={`flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent ${
                selection.kind === 'overview' ? 'bg-accent' : ''
              }`}
            >
              <LayoutList className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{t('health.overview')}</span>
            </button>

            {/* Its own destination, below the offline checks: unlike them it reaches
                the network and can change the repo, so it never runs by arriving here. */}
            <button
              type="button"
              onClick={() => select({ kind: 'updates' })}
              data-testid="health-check-updates"
              aria-current={selection.kind === 'updates'}
              className={`flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent ${
                selection.kind === 'updates' ? 'bg-accent' : ''
              }`}
            >
              <ArrowUpCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{t('health.updates.navItem')}</span>
            </button>

            {report.checks.map((check) => {
              const presentation = SEVERITY_PRESENTATION[check.severity]
              const Icon = presentation.icon
              const active = selection.kind === 'check' && selection.id === check.id
              return (
                <button
                  key={check.id}
                  type="button"
                  onClick={() => select({ kind: 'check', id: check.id })}
                  data-testid={`health-check-${check.id}`}
                  aria-current={active}
                  className={`flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent ${
                    active ? 'bg-accent' : ''
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${presentation.className}`} />
                  <span className="min-w-0 flex-1 truncate">
                    {t(`health.check.${check.id}.title`)}
                  </span>
                  {check.findings.length > 0 && (
                    <Badge variant={presentation.badge} className="shrink-0 text-[9px]">
                      {check.findings.length}
                    </Badge>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
