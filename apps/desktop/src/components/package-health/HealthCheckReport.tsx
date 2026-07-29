import { useTranslation } from '@git-manager/i18n'
import { Alert, Badge } from '@git-manager/ui'
import type { HealthCheck } from '@git-manager/git-types'
import { SEVERITY_PRESENTATION } from './healthSeverity'
import { describeFinding } from './describeFinding'

/** One check's findings: a header explaining what it looks for, then the hits. */
export function HealthCheckReport({ check }: { check: HealthCheck }) {
  const { t } = useTranslation('git')
  const presentation = SEVERITY_PRESENTATION[check.severity]
  const Icon = presentation.icon
  // Only two checks ship an explanation of why they couldn't run; the rest can't skip.
  const skippedKey = `health.check.${check.id}.skipped`

  return (
    <div className="space-y-3" data-testid={`health-report-${check.id}`}>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 shrink-0 ${presentation.className}`} />
          <h2 className="text-sm font-medium">{t(`health.check.${check.id}.title`)}</h2>
          <Badge variant={presentation.badge} className="text-[9px]">
            {t(presentation.labelKey)}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{t(`health.check.${check.id}.description`)}</p>
      </div>

      {check.severity === 'skipped' ? (
        <Alert variant="info" data-testid="health-report-skipped">
          <span className="text-xs">{t(skippedKey)}</span>
        </Alert>
      ) : check.findings.length === 0 ? (
        <Alert variant="success" data-testid="health-report-clear">
          <span className="text-xs">{t('health.noFindings')}</span>
        </Alert>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">
            {t('health.findings', { count: check.findings.length })}
          </p>
          {/* Two rows per finding: the facts on one line — dependency, then every
              declaration site as a compact chip — and the explanation on its own
              line beneath. Sharing one line squeezed the longer explanations (the
              catalog fix in particular) into a sliver between the name and the
              chips; giving them the full width keeps them readable without going
              back to the labelled sub-list this replaced. */}
          <ul className="space-y-1">
            {check.findings.map((finding, index) => {
              const description = describeFinding(check.id, finding, t)
              return (
                <li
                  key={`${finding.dependency ?? 'repo'}-${index}`}
                  className="rounded border border-border bg-card px-2 py-1.5"
                  data-testid="health-finding"
                >
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                    {finding.dependency != null && (
                      <span
                        className="min-w-0 flex-1 truncate font-mono text-xs"
                        title={finding.dependency}
                      >
                        {finding.dependency}
                      </span>
                    )}
                    {finding.refs.length > 0 && (
                      <span className="flex shrink-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]">
                        {finding.refs.map((ref) => (
                          <span
                            key={`${ref.path}-${ref.field}-${ref.range}`}
                            className="flex items-baseline gap-1"
                            data-testid="health-finding-ref"
                            // The manifest path is the only detail relegated to a
                            // tooltip; the field stays visible because for a duplicate
                            // declaration it *is* the finding (dependencies vs dev).
                            title={ref.path}
                          >
                            <span className="font-mono">{ref.package}</span>
                            <span className="text-[10px] text-muted-foreground">{ref.field}</span>
                            <span className="font-mono text-muted-foreground">{ref.range}</span>
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                  {description !== '' && (
                    <p
                      className="mt-0.5 text-[11px] text-muted-foreground"
                      data-testid="health-finding-description"
                    >
                      {description}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
