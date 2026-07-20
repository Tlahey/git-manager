import { useTranslation } from '@git-manager/i18n'
import { Button, Spinner, Progress } from '@git-manager/ui'
import { useAppUpdater } from '../../../hooks/useAppUpdater'

/** Settings → General: shows the running version and drives tauri-plugin-updater's
 *  check → download+install → relaunch flow behind a single button. */
export function UpdateCheck() {
  const { t } = useTranslation('settings')
  const {
    status,
    currentVersion,
    availableVersion,
    releaseNotes,
    progress,
    error,
    checkForUpdate,
    downloadAndInstall,
    relaunch,
  } = useAppUpdater()

  const percent =
    progress?.contentLength && progress.contentLength > 0
      ? Math.min(100, Math.round((progress.downloadedBytes / progress.contentLength) * 100))
      : null

  return (
    <div className="space-y-3" data-testid="update-check">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-semibold text-foreground">{t('settings.update.title')}</h4>
          {currentVersion && (
            <p className="text-[10px] text-muted-foreground">
              {t('settings.update.currentVersion', { version: currentVersion })}
            </p>
          )}
        </div>

        {status !== 'available' && status !== 'downloading' && status !== 'ready' && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2.5 text-[11px]"
            onClick={checkForUpdate}
            disabled={status === 'checking'}
            data-testid="update-check-button"
          >
            {status === 'checking' && <Spinner className="h-3 w-3" />}
            {status === 'checking' ? t('settings.update.checking') : t('settings.update.check')}
          </Button>
        )}
      </div>

      {status === 'up-to-date' && (
        <p className="text-[11px] text-muted-foreground" data-testid="update-up-to-date">
          {t('settings.update.upToDate')}
        </p>
      )}

      {status === 'error' && error && (
        <div className="flex items-center justify-between rounded border border-destructive/40 bg-destructive/5 px-3 py-2">
          <p className="text-[11px] text-destructive" data-testid="update-error">
            {t('settings.update.error', { message: error })}
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            onClick={checkForUpdate}
          >
            {t('settings.update.retry')}
          </Button>
        </div>
      )}

      {(status === 'available' || status === 'downloading' || status === 'ready') && (
        <div className="space-y-2 rounded border border-primary/30 bg-primary/5 p-3">
          <p className="text-[11px] font-medium text-foreground">
            {t('settings.update.available', { version: availableVersion })}
          </p>

          {releaseNotes && (
            <p className="max-h-24 overflow-y-auto whitespace-pre-wrap text-[10px] text-muted-foreground">
              {releaseNotes}
            </p>
          )}

          {status === 'downloading' && (
            <div className="space-y-1" data-testid="update-progress">
              <Progress
                value={percent ?? 0}
                aria-label={t('settings.update.downloading', { percent: percent ?? 0 })}
              />
              <p className="text-[10px] text-muted-foreground">
                {t('settings.update.downloading', { percent: percent ?? 0 })}
              </p>
            </div>
          )}

          {status === 'available' && (
            <Button
              size="sm"
              className="h-7 px-2.5 text-[11px]"
              onClick={downloadAndInstall}
              data-testid="update-download-button"
            >
              {t('settings.update.download')}
            </Button>
          )}

          {status === 'ready' && (
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-foreground">{t('settings.update.ready')}</p>
              <Button
                size="sm"
                className="h-7 px-2.5 text-[11px]"
                onClick={relaunch}
                data-testid="update-restart-button"
              >
                {t('settings.update.restart')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
