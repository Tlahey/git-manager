import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Checkbox, Switch } from '@git-manager/ui'
import { FolderOpen } from 'lucide-react'
import { useSettingsStore } from '../../../stores/settings.store'
import { apiOpenDailySummariesDir } from '../../../api/dailySummary.api'

/** Enablement toggles for the daily-summary (Launchpad briefing) AI feature, plus where its markdown
 * archive is written. Feature *enablement* only — the instruction, temperature and prompt live in
 * `@git-manager/ai`, never in Settings. */
export function AiDailySummarySettings() {
  const { t } = useTranslation('settings')
  const dailySummary = useSettingsStore((s) => s.settings.dailySummary) ?? {
    enabled: true,
    autoGenerate: true,
    saveToRepo: false,
  }
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const [openError, setOpenError] = useState<string | null>(null)

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

      {dailySummary.enabled && (
        <label className="flex cursor-pointer items-center justify-between pl-1">
          <div className="flex flex-col gap-0.5 pr-4">
            <span className="text-xs text-foreground">
              {t('settings.ai.dailySummary.saveToRepo')}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {t('settings.ai.dailySummary.saveToRepoHint')}
            </span>
          </div>
          <Checkbox
            checked={dailySummary.saveToRepo ?? false}
            onChange={(e) => updateDailySummary({ saveToRepo: e.target.checked })}
            data-testid="daily-summary-save-to-repo-toggle"
          />
        </label>
      )}

      <div className="flex flex-col gap-1 pl-1">
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-fit text-xs"
          onClick={async () => {
            setOpenError(null)
            try {
              await apiOpenDailySummariesDir()
            } catch (err) {
              setOpenError(String(err))
            }
          }}
          data-testid="daily-summary-open-folder"
        >
          <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
          {t('settings.ai.dailySummary.openFolder')}
        </Button>
        <span className="text-[10px] text-muted-foreground">
          {t('settings.ai.dailySummary.retentionHint')}
        </span>
        {openError && <span className="font-mono text-[10px] text-destructive">{openError}</span>}
      </div>
    </div>
  )
}
