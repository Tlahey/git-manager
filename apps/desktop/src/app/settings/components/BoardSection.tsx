import { useEffect, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Input, Switch } from '@git-manager/ui'
import { useSettingsStore } from '../../../stores/settings.store'

const DEFAULT_AUTO_SYNC = { enabled: false, intervalMinutes: 5 }

/** Settings for the remote (GitHub-backed) board's `.git-manager/board.json` auto-sync — see
 * `BoardSettings`'s doc comment in `@git-manager/git-types` for why this is off by default. */
export function BoardSection() {
  const { t } = useTranslation('settings')
  const { settings, updateSettings } = useSettingsStore()
  const autoSync = settings.board?.autoSync ?? DEFAULT_AUTO_SYNC

  function updateAutoSync(partial: Partial<typeof autoSync>) {
    updateSettings({ board: { autoSync: { ...autoSync, ...partial } } })
  }

  // Local draft for the numeric field so the user can clear it mid-edit (a NaN guard on the store
  // would otherwise snap it back) — same pattern as GeneralSection's auto-fetch interval.
  const [intervalDraft, setIntervalDraft] = useState(String(autoSync.intervalMinutes))
  useEffect(() => {
    setIntervalDraft(String(autoSync.intervalMinutes))
  }, [autoSync.intervalMinutes])

  function commitInterval(raw: string) {
    const n = parseInt(raw, 10)
    const clamped = Number.isNaN(n) ? 1 : Math.min(120, Math.max(1, n))
    updateAutoSync({ intervalMinutes: clamped })
  }

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer items-center gap-2">
        <Switch
          data-testid="settings-board-autosync-enabled"
          checked={autoSync.enabled}
          onChange={(e) => updateAutoSync({ enabled: e.target.checked })}
        />
        <span className="text-xs text-foreground">{t('settings.board.autoSyncEnabled')}</span>
      </label>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {t('settings.board.autoSyncHint')}
      </p>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">
          {t('settings.board.autoSyncInterval')}
        </label>
        <Input
          data-testid="settings-board-autosync-interval"
          type="number"
          min={1}
          max={120}
          value={intervalDraft}
          disabled={!autoSync.enabled}
          onChange={(e) => {
            setIntervalDraft(e.target.value)
            if (e.target.value.trim() !== '') commitInterval(e.target.value)
          }}
          onBlur={(e) => commitInterval(e.target.value)}
          className="h-8 w-24 text-xs"
        />
      </div>
    </div>
  )
}
