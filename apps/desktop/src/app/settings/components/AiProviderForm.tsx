import { useEffect, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Input, NativeSelect } from '@git-manager/ui'
import {
  AI_PRESETS,
  DEFAULT_CONTEXT_TOKENS,
  getAiPreset,
  type AiPresetId,
} from '@git-manager/ai'
import { useSettingsStore } from '../../../stores/settings.store'
import { useAiStatusStore } from '../../../stores/aiStatus.store'
import { ProviderCombobox } from './ProviderCombobox'
import { AiModelProbe } from './AiModelProbe'

/**
 * Connection settings for the AI provider: which preset, where it lives, an optional API key, the
 * model and the request timeout. Rendered only when AI features are enabled (see `AiSection`).
 *
 * Validating the URL goes through the shared `useAiStatusStore`, so the same result also drives the
 * global warning banner and the footer indicator — fixing the URL here silences them immediately.
 * The model list is whatever the provider advertises on `/v1/models`, which is what the validate
 * call reads; it degrades to a free-text field when the provider is unreachable or lists nothing.
 */
export function AiProviderForm() {
  const { t } = useTranslation('settings')
  const ai = useSettingsStore((s) => s.settings.ai)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const state = useAiStatusStore((s) => s.state)
  const models = useAiStatusStore((s) => s.models)
  const lastCheckedAt = useAiStatusStore((s) => s.lastCheckedAt)
  const detail = useAiStatusStore((s) => s.detail)
  const check = useAiStatusStore((s) => s.check)
  const [timeoutText, setTimeoutText] = useState(String(ai.timeoutSeconds))
  const [contextText, setContextText] = useState(
    String(ai.contextTokens ?? DEFAULT_CONTEXT_TOKENS)
  )

  const activePreset = getAiPreset(ai.preset)
  const isChecking = state === 'checking'

  // Populate the model dropdown on first open. A check that already ran (at startup, or from a
  // previous visit to this page) is reused as-is — re-validating is the button's job.
  useEffect(() => {
    if (lastCheckedAt === null) check(useSettingsStore.getState().settings.ai)
  }, [lastCheckedAt, check])

  // Re-sync the buffered timeout when the setting changes from outside the field — the page's
  // "reset to default" button would otherwise leave a stale number on screen.
  useEffect(() => setTimeoutText(String(ai.timeoutSeconds)), [ai.timeoutSeconds])
  useEffect(
    () => setContextText(String(ai.contextTokens ?? DEFAULT_CONTEXT_TOKENS)),
    [ai.contextTokens]
  )

  function updateAi(partial: Partial<typeof ai>) {
    updateSettings({ ai: { ...ai, ...partial } })
  }

  function handlePresetChange(presetId: AiPresetId) {
    const preset = getAiPreset(presetId)
    // A preset is mostly "a default URL", so switching moves the URL with it. The API key is
    // dropped when the new preset has no field for one, so a key can't linger invisibly in the
    // persisted settings after a move to Ollama.
    updateAi({
      preset: presetId,
      url: preset.defaultUrl,
      apiKey: preset.supportsApiKey ? ai.apiKey : undefined,
    })
    useAiStatusStore.getState().reset()
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
        />
        <p className="text-[10px] text-muted-foreground">{t(activePreset.descriptionKey)}</p>
      </div>

      {/* URL + validate — offered for every preset, including Ollama's local default */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('settings.ai.url')}</label>
        <div className="flex gap-2">
          <Input
            value={ai.url}
            onChange={(e) => updateAi({ url: e.target.value })}
            className="h-8 flex-1 text-xs"
            data-testid="ai-url-input"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0 text-xs"
            onClick={() => check(useSettingsStore.getState().settings.ai)}
            disabled={isChecking}
            data-testid="ai-test-connection-button"
          >
            {isChecking ? t('settings.ai.validating') : t('settings.ai.validate')}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">{t('settings.ai.urlHint')}</p>
        {(state === 'connected' || state === 'disconnected') && (
          <div role="status">
            <p
              data-testid="ai-connection-status"
              className={`text-xs ${
                state === 'connected' ? 'text-tone-success' : 'text-tone-danger'
              }`}
            >
              {state === 'disconnected'
                ? t('settings.ai.disconnected')
                : models.length > 0
                  ? t('settings.ai.connected', { count: models.length })
                  : t('settings.ai.connectedNoModels')}
            </p>
            {/* The exact URL that was probed, verbatim from the transport. Without it a wrong port
                and a base URL missing its /v1 are indistinguishable from "provider is down". */}
            {state === 'disconnected' && detail && (
              <p
                data-testid="ai-connection-detail"
                className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground"
              >
                {detail}
              </p>
            )}
          </div>
        )}
      </div>

      {/* API key — only the generic OpenAI-compatible entry can talk to an authenticated endpoint */}
      {activePreset.supportsApiKey && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">{t('settings.ai.apiKey')}</label>
          <Input
            type="password"
            value={ai.apiKey ?? ''}
            onChange={(e) => updateAi({ apiKey: e.target.value })}
            className="h-8 text-xs"
            data-testid="ai-api-key-input"
          />
          <p className="text-[10px] text-muted-foreground">{t('settings.ai.apiKeyHint')}</p>
        </div>
      )}

      {/* Model — dropdown of what /v1/models advertised, free text when there is nothing to list */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('settings.ai.model')}</label>
        {models.length > 0 ? (
          <NativeSelect
            data-testid="ai-model-select"
            value={ai.model}
            onChange={(e) => updateAi({ model: e.target.value })}
            className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {/* The persisted model may no longer be served; keep it selectable rather than
                silently snapping the setting to whatever the provider listed first. */}
            {!models.includes(ai.model) && ai.model !== '' && (
              <option value={ai.model}>{ai.model}</option>
            )}
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <Input
            value={ai.model}
            onChange={(e) => updateAi({ model: e.target.value })}
            placeholder={t('settings.ai.modelPlaceholder')}
            className="h-8 text-xs"
            data-testid="ai-model-input"
          />
        )}
        <p className="text-[10px] text-muted-foreground">{t('settings.ai.modelHint')}</p>
        <AiModelProbe />
      </div>

      {/* Timeout — the field is buffered as text so an in-progress edit (an empty box while
          retyping) can't persist a NaN into the settings the transport reads. */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('settings.ai.timeout')}</label>
        <Input
          type="number"
          min={5}
          max={300}
          value={timeoutText}
          onChange={(e) => {
            setTimeoutText(e.target.value)
            const parsed = parseInt(e.target.value, 10)
            if (!Number.isNaN(parsed)) updateAi({ timeoutSeconds: parsed })
          }}
          onBlur={() => setTimeoutText(String(ai.timeoutSeconds))}
          className="h-8 w-24 text-xs"
          data-testid="ai-timeout-input"
        />
      </div>

      {/* Context window — declared, not detected: no protocol the app speaks reports one reliably,
          and Ollama applies its own `num_ctx` regardless. Buffered as text like the timeout, for the
          same reason (an empty box mid-edit must not persist a NaN). */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('settings.ai.contextTokens')}</label>
        <Input
          type="number"
          min={1024}
          max={1000000}
          step={1024}
          value={contextText}
          onChange={(e) => {
            setContextText(e.target.value)
            const parsed = parseInt(e.target.value, 10)
            if (!Number.isNaN(parsed) && parsed > 0) updateAi({ contextTokens: parsed })
          }}
          onBlur={() => setContextText(String(ai.contextTokens ?? DEFAULT_CONTEXT_TOKENS))}
          className="h-8 w-32 text-xs"
          data-testid="ai-context-tokens-input"
        />
        <p className="text-[10px] text-muted-foreground">{t('settings.ai.contextTokensHint')}</p>
      </div>
    </div>
  )
}
