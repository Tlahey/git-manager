import { useTranslation } from '@git-manager/i18n'
import { Checkbox, Switch } from '@git-manager/ui'
import { useSettingsStore } from '../../../stores/settings.store'

/** Enablement toggles for the daily-summary (Launchpad briefing) AI feature. Feature *enablement*
 * only — the instruction, temperature and prompt live in `@git-manager/ai`, never in Settings. */
export function AiDailySummarySettings() {
  const { t } = useTranslation('settings')
  const dailySummary = useSettingsStore((s) => s.settings.dailySummary) ?? {
    enabled: true,
    autoGenerate: true,
  }
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  function updateDailySummary(partial: Partial<typeof dailySummary>) {
    updateSettings({ dailySummary: { ...dailySummary, ...partial } })
  }

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center justify-between">
        <div className="flex flex-col gap-0.5 pr-4">
          <span className="text-xs font-medium text-foreground">
            {t('settings.ai.dailySummary.enabled')}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {t('settings.ai.dailySummary.enabledHint')}
          </span>
        </div>
        <Switch
          checked={dailySummary.enabled}
          onChange={(e) => updateDailySummary({ enabled: e.target.checked })}
          data-testid="daily-summary-enabled-toggle"
          aria-label={t('settings.ai.dailySummary.enabled')}
        />
      </label>

      {dailySummary.enabled && (
        <label className="flex cursor-pointer items-center justify-between pl-1">
          <div className="flex flex-col gap-0.5 pr-4">
            <span className="text-xs text-foreground">
              {t('settings.ai.dailySummary.autoGenerate')}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {t('settings.ai.dailySummary.autoGenerateHint')}
            </span>
          </div>
          <Checkbox
            checked={dailySummary.autoGenerate}
            onChange={(e) => updateDailySummary({ autoGenerate: e.target.checked })}
            data-testid="daily-summary-auto-toggle"
          />
        </label>
      )}
    </div>
  )
}
