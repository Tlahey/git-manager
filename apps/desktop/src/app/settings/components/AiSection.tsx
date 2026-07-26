import { useTranslation } from '@git-manager/i18n'
import { Switch } from '@git-manager/ui'
import { useSettingsStore } from '../../../stores/settings.store'
import { AiProviderForm } from './AiProviderForm'
import { AiDailySummarySettings } from './AiDailySummarySettings'

/**
 * The AI settings page. The master switch is the only thing shown when AI is off: provider
 * configuration and per-feature toggles are meaningless then, and hiding them keeps the page honest
 * for users who never want AI (the AI-commit nav entry is hidden the same way, see `SettingsPage`).
 *
 * Instructions & tuning (temperature, system prompt, scope detection) are owned per-feature inside
 * `@git-manager/ai` and intentionally never surfaced here.
 */
export function AiSection() {
  const { t } = useTranslation('settings')
  const aiEnabled = useSettingsStore((s) => s.settings.ai.enabled !== false)
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  function setEnabled(enabled: boolean) {
    const { ai } = useSettingsStore.getState().settings
    updateSettings({ ai: { ...ai, enabled } })
  }

  return (
    <div className="space-y-5">
      {/* Master AI switch — gates every AI setting below, plus the AI-commit page. */}
      <label className="flex cursor-pointer items-center justify-between">
        <div className="flex flex-col gap-0.5 pr-4">
          <span className="text-xs font-medium text-foreground">{t('settings.ai.enabled')}</span>
          <span className="text-[10px] text-muted-foreground">{t('settings.ai.enabledHint')}</span>
        </div>
        <Switch
          checked={aiEnabled}
          onChange={(e) => setEnabled(e.target.checked)}
          data-testid="ai-enabled-toggle"
          aria-label={t('settings.ai.enabled')}
        />
      </label>

      {aiEnabled ? (
        <>
          <AiProviderForm />
          <div className="border-t border-border pt-5">
            <AiDailySummarySettings />
          </div>
        </>
      ) : (
        <p data-testid="ai-disabled-hint" className="text-xs text-muted-foreground">
          {t('settings.ai.disabledHint')}
        </p>
      )}
    </div>
  )
}
