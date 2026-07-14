import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Input } from '@git-manager/ui'
import { AI_PRESETS, getAiPreset, type AiPresetId, type AiProviderStatus } from '@git-manager/ai'
import { useSettingsStore } from '../../../stores/settings.store'
import { aiStatusService } from '../../../api/ai.api'
import { ProviderCombobox } from './ProviderCombobox'

export function AiSection() {
  const { t } = useTranslation('settings')
  const { settings, updateSettings } = useSettingsStore()
  const ai = settings.ai
  const [connectionStatus, setConnectionStatus] = useState<AiProviderStatus | null>(null)
  const [isTesting, setIsTesting] = useState(false)

  const activePreset = getAiPreset(ai.preset)

  function updateAi(partial: Partial<typeof ai>) {
    updateSettings({ ai: { ...ai, ...partial } })
  }

  function handlePresetChange(presetId: AiPresetId) {
    const preset = getAiPreset(presetId)
    updateAi({ preset: presetId, url: preset.defaultUrl })
    setConnectionStatus(null)
  }

  async function handleTestConnection() {
    setIsTesting(true)
    try {
      const status = await aiStatusService.check(ai)
      setConnectionStatus(status)
    } catch {
      setConnectionStatus({ connected: false, models: [] })
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Provider preset */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('settings.ai.preset')}</label>
        <ProviderCombobox
          presets={AI_PRESETS}
          value={ai.preset}
          onChange={handlePresetChange}
          searchPlaceholder={t('settings.ai.searchPlaceholder')}
          emptyLabel={t('settings.ai.noProviderFound')}
          comingSoonLabel={t('settings.ai.comingSoon')}
        />
      </div>

      {/* URL + Test */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('settings.ai.url')}</label>
        <div className="flex gap-2">
          <Input
            value={ai.url}
            onChange={(e) => updateAi({ url: e.target.value })}
            className="h-8 flex-1 text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0 text-xs"
            onClick={handleTestConnection}
            disabled={isTesting}
            data-testid="ai-test-connection-button"
          >
            {t('settings.ai.test')}
          </Button>
        </div>
        {connectionStatus !== null && (
          <p
            data-testid="ai-connection-status"
            className={`text-xs ${
              connectionStatus.connected ? 'text-green-500' : 'text-destructive'
            }`}
          >
            {connectionStatus.connected
              ? t('settings.ai.connected', { count: connectionStatus.models.length })
              : t('settings.ai.disconnected')}
          </p>
        )}
      </div>

      {/* API key (only for presets that need one) */}
      {activePreset.requiresApiKey && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">{t('settings.ai.apiKey')}</label>
          <Input
            type="password"
            value={ai.apiKey ?? ''}
            onChange={(e) => updateAi({ apiKey: e.target.value })}
            className="h-8 text-xs"
            data-testid="ai-api-key-input"
          />
        </div>
      )}

      {/* Model */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('settings.ai.model')}</label>
        {connectionStatus?.connected && connectionStatus.models.length > 0 ? (
          <select
            data-testid="ai-model-select"
            value={ai.model}
            onChange={(e) => updateAi({ model: e.target.value })}
            className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {connectionStatus.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <Input
            value={ai.model}
            onChange={(e) => updateAi({ model: e.target.value })}
            className="h-8 text-xs"
          />
        )}
      </div>

      {/* Timeout */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('settings.ai.timeout')}</label>
        <Input
          type="number"
          min={5}
          max={300}
          value={ai.timeoutSeconds}
          onChange={(e) => updateAi({ timeoutSeconds: parseInt(e.target.value, 10) })}
          className="h-8 w-24 text-xs"
        />
      </div>

      {/* Instructions & tuning (temperature, system prompt, scope detection) are owned per-feature
          inside @git-manager/ai and intentionally not exposed here — see AiSection's note. */}
    </div>
  )
}
