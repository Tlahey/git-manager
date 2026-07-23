import { useTranslation } from '@git-manager/i18n'
import { Button, Spinner, Progress } from '@git-manager/ui'
import { Download, RefreshCw } from 'lucide-react'
import { useAppUpdaterStore } from '../../../stores/appUpdater.store'

/**
 * Updater pinned to the bottom of the Settings side panel (below Support). Shows the running
 * version plus a single state-driven button that runs the check → download+install → relaunch
 * flow. When the startup check found a newer version the button is promoted to the primary
 * (highlighted) variant so an available update stands out at a glance.
 */
export function SidebarUpdater() {
  const { t } = useTranslation('settings')
  const status = useAppUpdaterStore((s) => s.status)
  const currentVersion = useAppUpdaterStore((s) => s.currentVersion)
  const availableVersion = useAppUpdaterStore((s) => s.availableVersion)
  const progress = useAppUpdaterStore((s) => s.progress)
  const error = useAppUpdaterStore((s) => s.error)
  const checkForUpdate = useAppUpdaterStore((s) => s.checkForUpdate)
  const downloadAndInstall = useAppUpdaterStore((s) => s.downloadAndInstall)
  const relaunch = useAppUpdaterStore((s) => s.relaunch)

  const percent =
    progress?.contentLength && progress.contentLength > 0
      ? Math.min(100, Math.round((progress.downloadedBytes / progress.contentLength) * 100))
      : null

  return (
    <div
      className="mt-2 shrink-0 space-y-1.5 border-t border-border px-3 pt-2"
      data-testid="sidebar-updater"
    >
      <p className="text-[10px] text-muted-foreground" data-testid="sidebar-updater-version">
        {currentVersion
          ? t('settings.update.currentVersion', { version: currentVersion })
          : t('settings.update.title')}
      </p>

      {status === 'available' && (
        <Button
          size="sm"
          className="h-7 w-full gap-1.5 px-2 text-[11px]"
          onClick={downloadAndInstall}
          data-testid="sidebar-updater-download"
        >
          <Download className="h-3 w-3" />
          {t('settings.update.available', { version: availableVersion })}
        </Button>
      )}

      {status === 'downloading' && (
        <div className="space-y-1" data-testid="sidebar-updater-progress">
          <Progress
            value={percent ?? 0}
            aria-label={t('settings.update.downloading', { percent: percent ?? 0 })}
          />
          <p className="text-[10px] text-muted-foreground">
            {t('settings.update.downloading', { percent: percent ?? 0 })}
          </p>
        </div>
      )}

      {status === 'ready' && (
        <Button
          size="sm"
          className="h-7 w-full px-2 text-[11px]"
          onClick={relaunch}
          data-testid="sidebar-updater-restart"
        >
          {t('settings.update.restart')}
        </Button>
      )}

      {status !== 'available' && status !== 'downloading' && status !== 'ready' && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-full gap-1.5 px-2 text-[11px]"
          onClick={() => checkForUpdate()}
          disabled={status === 'checking'}
          data-testid="sidebar-updater-check"
        >
          {status === 'checking' ? (
            <Spinner className="h-3 w-3" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          {status === 'checking' ? t('settings.update.checking') : t('settings.update.check')}
        </Button>
      )}

      {status === 'up-to-date' && (
        <p className="text-[10px] text-muted-foreground" data-testid="sidebar-updater-up-to-date">
          {t('settings.update.upToDate')}
        </p>
      )}

      {status === 'error' && error && (
        <p className="text-[10px] text-destructive" data-testid="sidebar-updater-error">
          {t('settings.update.error')}
        </p>
      )}
    </div>
  )
}
