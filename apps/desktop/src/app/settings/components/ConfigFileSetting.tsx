import { useEffect, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button } from '@git-manager/ui'
import { apiGetAppConfigPath, apiRevealAppConfig } from '../../../api/config.api'
import { FilterableSetting, Highlight } from './settingsSearch'

/**
 * Tells the user where their configuration lives, and reveals it in the Finder.
 *
 * It replaces an "Open app data folder" button that opened nothing: it was pointed at a hardcoded
 * `~/.config/git-manager/`, a directory this app has never used, and the failure was swallowed. The
 * path is now asked for rather than assumed, which is also what lets this say something useful when
 * there is no file at all — `GIT_MANAGER_NO_CONFIG` switches the configuration off, and an app
 * running that way should say so instead of offering to reveal a file it will never write.
 *
 * Showing the path as text, not just a button, is deliberate: it is the answer to "where are my
 * settings" for anyone reading over a shoulder, backing up a machine, or being asked for their
 * configuration in a bug report.
 */
export function ConfigFileSetting() {
  const { t } = useTranslation('settings')
  const [path, setPath] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void apiGetAppConfigPath().then((resolved) => {
      if (!cancelled) setPath(resolved)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Undefined while the path is being resolved: rendering "no configuration file" for a frame and
  // then replacing it with a path would read as a real state the user never had.
  if (path === undefined) return null

  return (
    <FilterableSetting
      className="space-y-1.5"
      testId="setting-config-file"
      match={`${t('settings.advanced.configFile')} ${t('settings.advanced.revealConfigFile')} settings.json configuration fichier config path chemin`}
    >
      <label className="text-xs font-medium text-foreground">
        <Highlight text={t('settings.advanced.configFile')} />
      </label>

      {path === null ? (
        <p className="text-xs text-muted-foreground" data-testid="config-file-disabled">
          {t('settings.advanced.configFileDisabled')}
        </p>
      ) : (
        <>
          <p
            className="font-mono text-xs break-all text-muted-foreground"
            data-testid="config-file-path"
          >
            {path}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            data-testid="reveal-config-file"
            onClick={() => void apiRevealAppConfig(path)}
          >
            {t('settings.advanced.revealConfigFile')}
          </Button>
        </>
      )}
    </FilterableSetting>
  )
}
