import { useTranslation } from '@git-manager/i18n'
import { Alert, Badge, Button, LlmIcon, Spinner } from '@git-manager/ui'
import type { UpgradeRiskResult } from '@git-manager/ai'
import type { OutdatedPackage } from '@git-manager/git-types'
import { useAiEnabled } from '../../hooks/useAiEnabled'
import { usePackageChangelog } from '../../hooks/usePackageHealth'
import { useUpgradeRisk } from '../../hooks/useUpgradeRisk'

const RISK_BADGE: Record<
  UpgradeRiskResult['risk'],
  'success' | 'warning' | 'destructive' | 'outline'
> = {
  unknown: 'outline',
  low: 'success',
  medium: 'warning',
  high: 'destructive',
}

/**
 * "What would this upgrade break *here*" — the release notes crossed with the
 * repo's own import sites.
 *
 * Advisory by construction, and the UI says so twice: the disclaimer is always
 * visible, and the updates page keeps its confirmation on a major whatever comes
 * back. The costly failure is a user skipping the changelog because a model said
 * "low", so nothing here is styled as a green light.
 */
export function UpgradeRiskReport({
  entry,
  repoPath,
  token,
}: {
  entry: OutdatedPackage
  repoPath: string
  token?: string
}) {
  const { t } = useTranslation('git')
  const aiEnabled = useAiEnabled()
  // The same key the notes above are rendered from, so this shares their fetch.
  const { data: changelog } = usePackageChangelog(
    repoPath,
    entry.name,
    entry.current,
    entry.latest,
    token
  )
  const { result, running, phase, elapsedSeconds, fileCount, error, assess } =
    useUpgradeRisk(repoPath)

  return (
    <div className="space-y-2 border-t border-border pt-3" data-testid="upgrade-risk">
      <div className="flex flex-wrap items-center gap-2">
        <LlmIcon className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 text-sm font-medium">{t('health.risk.title')}</span>
        {result != null && (
          <Badge variant={RISK_BADGE[result.risk]} className="shrink-0 text-[9px]">
            {t(`health.risk.level.${result.risk}`)}
          </Badge>
        )}
      </div>

      {!aiEnabled ? (
        <Alert variant="info" data-testid="upgrade-risk-disabled">
          <span className="text-[11px]">{t('health.risk.aiDisabled')}</span>
        </Alert>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={running}
          onClick={() => assess(entry, changelog)}
          data-testid="upgrade-risk-run"
        >
          {running ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : null}
          {running
            ? t('health.risk.running')
            : result != null
              ? t('health.risk.retry')
              : t('health.risk.run')}
        </Button>
      )}

      {/* The call has no time limit, so the wait has to show it is a wait: which
          step is running, what the scan already found, and a ticking counter. */}
      {running && (
        <div
          className="space-y-0.5 text-[11px] text-muted-foreground"
          data-testid="upgrade-risk-progress"
        >
          <p className="flex items-center gap-2">
            <span data-testid="upgrade-risk-phase">{t(`health.risk.phase.${phase}`)}</span>
            <span className="font-mono" data-testid="upgrade-risk-elapsed">
              {t('health.risk.elapsed', { seconds: elapsedSeconds })}
            </span>
          </p>
          {fileCount != null && (
            <p data-testid="upgrade-risk-scanned">
              {t('health.risk.scanned', { count: fileCount })}
            </p>
          )}
          <p className="text-[10px]">{t('health.risk.noTimeout')}</p>
        </div>
      )}

      {error != null && (
        <Alert variant="destructive" data-testid="upgrade-risk-error">
          <span className="text-[11px]">{t('health.risk.error')}</span>
          <pre className="mt-1 whitespace-pre-wrap font-mono text-[10px]">{error}</pre>
        </Alert>
      )}

      {result != null && (
        <div className="space-y-2" data-testid="upgrade-risk-result">
          {result.summary !== '' && <p className="text-[11px]">{result.summary}</p>}

          {result.risk === 'unknown' && (
            <p className="text-[11px] text-muted-foreground" data-testid="upgrade-risk-unknown">
              {t('health.risk.unknownHint')}
            </p>
          )}

          {result.changes.length === 0 && result.risk !== 'unknown' ? (
            <p className="text-[11px] text-muted-foreground" data-testid="upgrade-risk-no-changes">
              {t('health.risk.noChanges')}
            </p>
          ) : (
            <ul className="space-y-1">
              {result.changes.map((change, index) => (
                <li
                  key={`${change.change}-${index}`}
                  className="rounded border border-border bg-background px-2 py-1.5"
                  data-testid="upgrade-risk-change"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="min-w-0 flex-1 text-[11px]">{change.change}</span>
                    <Badge
                      variant={change.affectsUs ? 'warning' : 'secondary'}
                      className="shrink-0 text-[9px]"
                    >
                      {change.affectsUs ? t('health.risk.affectsUs') : t('health.risk.notAffected')}
                    </Badge>
                  </div>
                  {change.note !== '' && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{change.note}</p>
                  )}
                  {change.where.length > 0 && (
                    <ul className="mt-0.5 space-y-0.5">
                      {change.where.map((path) => (
                        <li
                          key={path}
                          className="truncate font-mono text-[10px] text-muted-foreground"
                          title={path}
                          data-testid="upgrade-risk-where"
                        >
                          {path}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}

          <p className="text-[10px] text-muted-foreground" data-testid="upgrade-risk-disclaimer">
            {t('health.risk.disclaimer')}
          </p>
        </div>
      )}
    </div>
  )
}
