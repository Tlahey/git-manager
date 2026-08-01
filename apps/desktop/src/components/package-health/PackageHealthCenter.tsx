import { X } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { Alert, Badge, ScrollArea, Spinner } from '@git-manager/ui'
import type { PackageHealthReport } from '@git-manager/git-types'
import { usePackageHealth } from '../../hooks/usePackageHealth'
import { usePackageHealthStore } from '../../stores/packageHealth.store'
import { HealthCheckReport } from './HealthCheckReport'
import { PackageUpdatesPage } from './PackageUpdatesPage'
import { failingChecks } from './healthSeverity'

/** Workspace inventory, shown when nothing is selected. */
function Overview({ report }: { report: PackageHealthReport }) {
  const { t } = useTranslation('git')
  const failing = failingChecks(report.checks)

  return (
    <div className="space-y-4" data-testid="health-report-overview">
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">
          {t('health.summary.packages', { count: report.packages.length })}
        </Badge>
        <Badge variant="secondary">
          {t('health.summary.dependencies', { count: report.dependencyCount })}
        </Badge>
        <Badge variant="secondary">
          {t('health.summary.manager')}: {report.packageManager}
        </Badge>
        <Badge variant="secondary">
          {t('health.summary.catalog')}:{' '}
          {report.hasCatalog ? t('health.summary.catalogOn') : t('health.summary.catalogOff')}
        </Badge>
      </div>

      <Alert variant={failing.length === 0 ? 'success' : 'warning'}>
        <span className="text-xs">
          {failing.length === 0
            ? t('health.summary.allClear')
            : t('health.summary.problems', { count: failing.length })}
        </span>
      </Alert>

      <ul className="space-y-1">
        {report.packages.map((pkg) => (
          <li
            key={pkg.path}
            className="flex items-baseline gap-2 rounded border border-border bg-card px-2 py-1.5 text-xs"
            data-testid="health-workspace-package"
          >
            <span className="min-w-0 flex-1 truncate font-mono" title={pkg.path}>
              {pkg.name}
            </span>
            {pkg.version != null && (
              <span className="shrink-0 text-[11px] text-muted-foreground">{pkg.version}</span>
            )}
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {t('health.summary.dependencies', { count: pkg.dependencyCount })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Center pane of the package health workspace: the report for whatever the right
 * panel has selected. Reads the same SWR key as the panel, so the two render one
 * fetch rather than racing two.
 */
export function PackageHealthCenter({ repoPath }: { repoPath: string }) {
  const { t } = useTranslation('git')
  const { data: report, error, isLoading } = usePackageHealth(repoPath)
  const selection = usePackageHealthStore((s) => s.selection)
  const close = usePackageHealthStore((s) => s.close)

  const selectedCheck =
    selection.kind === 'check' ? report?.checks.find((c) => c.id === selection.id) : undefined

  return (
    <div className="flex h-full w-full min-w-0 flex-col" data-testid="package-health-center">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-medium">{t('health.title')}</h1>
          <p className="truncate text-[11px] text-muted-foreground">{t('health.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={close}
          className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={t('actions.close')}
          data-testid="package-health-close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner className="h-4 w-4" />
              {t('health.loading')}
            </div>
          ) : error != null ? (
            <Alert variant="destructive" data-testid="package-health-center-error">
              <span className="text-xs">{t('health.error')}</span>
              <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px]">{String(error)}</pre>
            </Alert>
          ) : report == null ? null : selection.kind === 'updates' ? (
            // Keyed on the repo so a switch remounts rather than carrying this
            // page's own state across: the changelog it has open belongs to a
            // package in the repo it was opened from.
            <PackageUpdatesPage
              key={repoPath}
              repoPath={repoPath}
              packageManager={report.packageManager}
            />
          ) : selectedCheck != null ? (
            <HealthCheckReport check={selectedCheck} />
          ) : (
            <Overview report={report} />
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
