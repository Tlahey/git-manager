import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Input, Textarea } from '@git-manager/ui'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useSettingsStore } from '../../../stores/settings.store'
import { apiCheckOllamaStatus } from '../../../api/ollama.api'
import type { OllamaStatus } from '@git-manager/git-types'

export function LlmSection() {
  const { t } = useTranslation('settings')
  const { settings, updateSettings } = useSettingsStore()
  const ollama = settings.ollama
  const [connectionStatus, setConnectionStatus] = useState<OllamaStatus | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [promptExpanded, setPromptExpanded] = useState(false)

  function updateOllama(partial: Partial<typeof ollama>) {
    updateSettings({ ollama: { ...ollama, ...partial } })
  }

  async function handleTestConnection() {
    setIsTesting(true)
    try {
      const status = await apiCheckOllamaStatus(ollama.url)
      setConnectionStatus(status)
    } catch {
      setConnectionStatus({ connected: false, models: [] })
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* URL + Test */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('settings.ollama.url')}</label>
        <div className="flex gap-2">
          <Input
            value={ollama.url}
            onChange={(e) => updateOllama({ url: e.target.value })}
            className="h-8 flex-1 text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0 text-xs"
            onClick={handleTestConnection}
            disabled={isTesting}
          >
            {t('settings.ollama.test')}
          </Button>
        </div>
        {connectionStatus !== null && (
          <p
            className={`text-xs ${
              connectionStatus.connected ? 'text-green-500' : 'text-destructive'
            }`}
          >
            {connectionStatus.connected
              ? t('settings.ollama.connected', { count: connectionStatus.models.length })
              : t('settings.ollama.disconnected')}
          </p>
        )}
      </div>

      {/* Model */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('settings.ollama.model')}</label>
        {connectionStatus?.connected && connectionStatus.models.length > 0 ? (
          <select
            value={ollama.model}
            onChange={(e) => updateOllama({ model: e.target.value })}
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
            value={ollama.model}
            onChange={(e) => updateOllama({ model: e.target.value })}
            className="h-8 text-xs"
          />
        )}
      </div>

      {/* Temperature */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">
          {t('settings.ollama.temperature')}
        </label>
        <Input
          type="number"
          min={0}
          max={1}
          step={0.1}
          value={ollama.temperature}
          onChange={(e) => updateOllama({ temperature: parseFloat(e.target.value) })}
          className="h-8 w-24 text-xs"
        />
      </div>

      {/* Timeout */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">
          {t('settings.ollama.timeout')}
        </label>
        <Input
          type="number"
          min={5}
          max={300}
          value={ollama.timeoutSeconds}
          onChange={(e) => updateOllama({ timeoutSeconds: parseInt(e.target.value, 10) })}
          className="h-8 w-24 text-xs"
        />
      </div>

      {/* Checkboxes */}
      <div className="space-y-2">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={ollama.includeRepoContext}
            onChange={(e) => updateOllama({ includeRepoContext: e.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-xs text-foreground">{t('settings.llm.includeContext')}</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={ollama.autoDetectScope}
            onChange={(e) => updateOllama({ autoDetectScope: e.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-xs text-foreground">{t('settings.llm.autoScope')}</span>
        </label>
      </div>

      {/* System prompt (collapsible) */}
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => setPromptExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium text-foreground transition-colors hover:text-primary"
        >
          {promptExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          {t('settings.llm.systemPrompt')}
        </button>
        {promptExpanded && (
          <div className="space-y-1.5">
            <Textarea
              value={ollama.systemPrompt}
              onChange={(e) => updateOllama({ systemPrompt: e.target.value })}
              rows={5}
              className="resize-none font-mono text-xs"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => updateOllama({ systemPrompt: '' })}
            >
              {t('settings.llm.resetPrompt')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
