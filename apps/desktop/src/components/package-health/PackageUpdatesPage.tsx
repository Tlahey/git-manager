import { useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { Alert, Button, Spinner, toast } from '@git-manager/ui'
import type { OutdatedPackage } from '@git-manager/git-types'
import { useOutdatedPackages, useUpdatePackages } from '../../hooks/usePackageHealth'
import { useSettingsStore } from '../../stores/settings.store'
import { PackageChangelogPanel } from './PackageChangelogPanel'
import { PackageUpdateRow } from './PackageUpdateRow'

/**
 * The updates page: its own destination in the health workspace rather than a
 * section of the overview, because it is the only part that reaches the network
 * and the only part that can change the repo.
 *
 * Opening the page runs the scan, once — `useOutdatedPackages` is a cached query,
 * so returning to the tab reuses the previous answer rather than shelling out to
 * the package manager again. Refreshing is explicit. The *updates* stay behind a
 * click regardless: those rewrite manifests and the lockfile.
 */
export function PackageUpdatesPage({
  repoPath,
  packageManager,
}: {
  repoPath: string
  packageManager: string
}) {
  const { t } = useTranslation('git')
  const github = useSettingsStore((s) => s.settings.github)
  // Optional: public repos resolve unauthenticated, just at a lower rate limit.
  const token = github?.accounts?.find((a) => a.id === github.activeAccountId)?.token ?? undefined

  const {
    data,
    error: scanError,
    isLoading,
    isValidating,
    mutate: scan,
  } = useOutdatedPackages(repoPath, packageManager)
  // `isValidating` covers the manual refresh too, which `isLoading` does not.
  const scanning = isLoading || isValidating
  const {
    error: updateError,
    isMutating: updating,
    trigger: runUpdate,
  } = useUpdatePackages(repoPath, packageManager)

  // Which package's release notes the side panel is showing, if any.
  const [changelogFor, setChangelogFor] = useState<OutdatedPackage | null>(null)

  const inRange = useMemo(
    () => (data?.packages ?? []).filter((p) => p.wanted !== p.current),
    [data]
  )

  async function update(names: string[], toLatest: boolean) {
    const outcome = await runUpdate({ names, toLatest })
    if (outcome == null) return
    toast.success(t('health.updates.updated', { count: outcome.updated.length }), {
      description: t('health.updates.reload'),
    })
    // The list is stale the moment the manager finishes, so re-scan rather than
    // leaving rows advertising updates that just landed.
    await scan()
  }

  return (
    <div className="space-y-3" data-testid="package-updates-page">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">{t('health.updates.title')}</h2>
        <p className="text-xs text-muted-foreground">
          {t('health.updates.subtitle', { manager: packageManager })}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => scan()} disabled={scanning} data-testid="updates-scan">
          {scanning ? (
            <Spinner className="mr-1.5 h-3.5 w-3.5" />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          {scanning
            ? t('health.outdated.running', { manager: packageManager })
            : t('health.outdated.run')}
        </Button>
        {inRange.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            disabled={updating || scanning}
            onClick={() =>
              update(
                inRange.map((p) => p.name),
                false
              )
            }
            data-testid="updates-bulk-in-range"
          >
            {updating ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : null}
            {t('health.updates.updateAllInRange', { count: inRange.length })}
          </Button>
        )}
      </div>

      {scanError != null && (
        <Alert variant="destructive" data-testid="updates-scan-error">
          <span className="text-xs">{t('health.outdated.error')}</span>
          <pre className="mt-1 font-mono text-[11px] whitespace-pre-wrap">{String(scanError)}</pre>
        </Alert>
      )}

      {updateError != null && (
        <Alert variant="destructive" data-testid="updates-run-error">
          <span className="text-xs">{t('health.updates.updateError')}</span>
          <pre className="mt-1 font-mono text-[11px] whitespace-pre-wrap">
            {String(updateError)}
          </pre>
        </Alert>
      )}

      {data?.status === 'toolMissing' && (
        <Alert variant="warning" data-testid="updates-tool-missing">
          <span className="text-xs">
            {t('health.outdated.toolMissing', { manager: packageManager })}
          </span>
        </Alert>
      )}

      {data?.status === 'unsupported' && (
        <Alert variant="info" data-testid="updates-unsupported">
          <span className="text-xs">
            {t('health.outdated.unsupported', { manager: packageManager })}
          </span>
        </Alert>
      )}

      {data?.status === 'ok' &&
        (data.packages.length === 0 ? (
          <Alert variant="success" data-testid="updates-up-to-date">
            <span className="text-xs">{t('health.outdated.upToDate')}</span>
          </Alert>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground">
              {t('health.outdated.count', { count: data.packages.length })}
            </p>
            <ul className="space-y-1">
              {data.packages.map((entry) => (
                <PackageUpdateRow
                  key={entry.name}
                  entry={entry}
                  busy={updating}
                  onUpdate={update}
                  onShowChangelog={setChangelogFor}
                />
              ))}
            </ul>
          </>
        ))}

      {/* Mounted only while a package is selected, so the fetch follows the click. */}
      {changelogFor != null && (
        <PackageChangelogPanel
          entry={changelogFor}
          repoPath={repoPath}
          token={token}
          onClose={() => setChangelogFor(null)}
        />
      )}
    </div>
  )
}
