import { useTranslation } from '@git-manager/i18n'
import { Switch } from '@git-manager/ui'
import { useSettingsStore } from '../../../stores/settings.store'
import { AiProviderForm } from './AiProviderForm'

/**
 * The AI **provider** page: the master switch, and how to reach a model.
 *
 * The switch is the only thing shown when AI is off — a connection form is meaningless then, and
 * hiding it keeps the page honest for users who never want AI. It also gates the AI features nav
 * entry entirely (see `SettingsPage`), which is why it lives here rather than there: you cannot
 * turn AI back on from a page that is hidden while it is off.
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
      {/* Master AI switch — gates the connection form below, the AI features page, and every
          AI affordance in the app. */}
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
        // Connection only. What the AI is asked to *do* lives on the features page, which this
        // switch also gates — see `AiFeaturesSection`.
        <AiProviderForm />
      ) : (
        <p data-testid="ai-disabled-hint" className="text-xs text-muted-foreground">
          {t('settings.ai.disabledHint')}
        </p>
      )}
    </div>
  )
}
