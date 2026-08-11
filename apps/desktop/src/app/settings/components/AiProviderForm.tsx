import { useEffect, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Input, NativeSelect, Textarea } from '@git-manager/ui'
import {
  AI_PRESETS,
  DEFAULT_AI_CONCURRENCY,
  DEFAULT_CONTEXT_TOKENS,
  MAX_AI_CONCURRENCY,
  getAiPreset,
  type AiPresetId,
} from '@git-manager/ai'
import { useSettingsStore } from '../../../stores/settings.store'
import { useAiStatusStore } from '../../../stores/aiStatus.store'
import { ProviderCombobox } from './ProviderCombobox'
import { AiModelProbe } from './AiModelProbe'
import { SettingsGroup } from './SettingsGroup'
import { AiContextWindowCheck } from './AiContextWindowCheck'
import { AiApiKeyField } from './AiApiKeyField'
import { parseExtraBody } from './parseExtraBody'

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
  const [contextText, setContextText] = useState(String(ai.contextTokens ?? DEFAULT_CONTEXT_TOKENS))
  const [concurrencyText, setConcurrencyText] = useState(
    String(ai.concurrency ?? DEFAULT_AI_CONCURRENCY)
  )
  const [extraBodyText, setExtraBodyText] = useState(() =>
    ai.extraBody && Object.keys(ai.extraBody).length > 0
      ? JSON.stringify(ai.extraBody, null, 2)
      : ''
  )
  const [extraBodyError, setExtraBodyError] = useState(false)

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
  useEffect(
    () => setConcurrencyText(String(ai.concurrency ?? DEFAULT_AI_CONCURRENCY)),
    [ai.concurrency]
  )

  function updateAi(partial: Partial<typeof ai>) {
    updateSettings({ ai: { ...ai, ...partial } })
  }

  function handlePresetChange(presetId: AiPresetId) {
    const preset = getAiPreset(presetId)
    // A preset is mostly "a default URL", so switching moves the URL with it. A stored API key is
    // left alone: it is in the keychain, not in the settings, so it cannot "linger invisibly" the
    // way it could when it was a persisted field — and silently deleting a credential because the
    // user tried Ollama for a minute would be a worse surprise than an unused keychain entry. The
    // field below disappears with the preset; `AiApiKeyField` is where it is removed on purpose.
    updateAi({ preset: presetId, url: preset.defaultUrl })
    useAiStatusStore.getState().reset()
  }

  return (
    <div className="space-y-5">
      <SettingsGroup
        title={t('settings.ai.groupProvider')}
        description={t('settings.ai.groupProviderHint')}
        divided={false}
        testId="ai-group-provider"
      >
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
                  className="mt-0.5 font-mono text-[10px] break-all text-muted-foreground"
                >
                  {detail}
                </p>
              )}
            </div>
          )}
        </div>

        {/* API key — only the generic OpenAI-compatible entry can talk to an authenticated endpoint */}
        {activePreset.supportsApiKey && <AiApiKeyField />}
      </SettingsGroup>

      <SettingsGroup
        title={t('settings.ai.groupModels')}
        description={t('settings.ai.groupModelsHint')}
        testId="ai-group-models"
      >
        {/* Two columns, because the two slots are a comparison: which model does the thinking, and
            which one does the volume. Stacked they read as two unrelated fields and the second one
            looks like an afterthought nobody needs to consider. */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Main model — dropdown of what /v1/models advertised, free text when nothing is listed */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">{t('settings.ai.model')}</label>
            {models.length > 0 ? (
              <NativeSelect
                data-testid="ai-model-select"
                value={ai.model}
                onChange={(e) => updateAi({ model: e.target.value })}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs text-foreground focus:ring-1 focus:ring-ring focus:outline-hidden"
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
          </div>

          {/* Fast model — optional. Same weight on screen as the main one so the comparison reads,
              but "Same as the main model" is the first option: leaving it alone is the norm. */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              {t('settings.ai.fastModel')}
            </label>
            {models.length > 0 ? (
              <NativeSelect
                data-testid="ai-fast-model-select"
                value={ai.fastModel ?? ''}
                onChange={(e) => updateAi({ fastModel: e.target.value })}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs text-foreground focus:ring-1 focus:ring-ring focus:outline-hidden"
              >
                <option value="">{t('settings.ai.fastModelNone')}</option>
                {ai.fastModel && !models.includes(ai.fastModel) && (
                  <option value={ai.fastModel}>{ai.fastModel}</option>
                )}
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </NativeSelect>
            ) : (
              <Input
                value={ai.fastModel ?? ''}
                onChange={(e) => updateAi({ fastModel: e.target.value })}
                placeholder={t('settings.ai.fastModelPlaceholder')}
                className="h-8 text-xs"
                data-testid="ai-fast-model-input"
              />
            )}
            <p className="text-[10px] text-muted-foreground">{t('settings.ai.fastModelHint')}</p>
          </div>
        </div>

        {/* One test row under both columns: the two slots are checked together because a setup is
            only valid when every model it names answers. */}
        <AiModelProbe fastModel={ai.fastModel} />
      </SettingsGroup>

      <SettingsGroup
        title={t('settings.ai.groupLimits')}
        description={t('settings.ai.groupLimitsHint')}
        testId="ai-group-limits"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Timeout — the field is buffered as text so an in-progress edit (an empty box while
          retyping) can't persist a NaN into the settings the transport reads. Zero is a real value,
          not an empty one: it means no budget at all (see the hint), which is why `min` is 0 and why
          the notice below appears rather than the field silently accepting something inert. */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              {t('settings.ai.timeout')}
            </label>
            <Input
              type="number"
              min={0}
              max={3600}
              value={timeoutText}
              onChange={(e) => {
                setTimeoutText(e.target.value)
                const parsed = parseInt(e.target.value, 10)
                if (!Number.isNaN(parsed) && parsed >= 0) updateAi({ timeoutSeconds: parsed })
              }}
              onBlur={() => setTimeoutText(String(ai.timeoutSeconds))}
              className="h-8 w-24 text-xs"
              data-testid="ai-timeout-input"
            />
            <p className="text-[10px] text-muted-foreground">{t('settings.ai.timeoutHint')}</p>
            {ai.timeoutSeconds === 0 && (
              <p className="text-[10px] text-tone-warning" data-testid="ai-timeout-none">
                {t('settings.ai.timeoutNone')}
              </p>
            )}
          </div>

          {/* Context window — declared, not detected: no protocol the app speaks reports one reliably,
          and Ollama applies its own `num_ctx` regardless. Buffered as text like the timeout, for the
          same reason (an empty box mid-edit must not persist a NaN). */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              {t('settings.ai.contextTokens')}
            </label>
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
            <p className="text-[10px] text-muted-foreground">
              {t('settings.ai.contextTokensHint')}
            </p>
          </div>

          {/* Concurrency — a property of the server, not of any feature, which is why it sits with
          the timeout rather than anywhere near a feature's settings. Whether raising it helps is
          decided by the provider's scheduler, so the hint says "measure", not "faster". */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              {t('settings.ai.concurrency')}
            </label>
            <Input
              type="number"
              min={1}
              max={MAX_AI_CONCURRENCY}
              value={concurrencyText}
              onChange={(e) => {
                setConcurrencyText(e.target.value)
                const parsed = parseInt(e.target.value, 10)
                if (!Number.isNaN(parsed) && parsed > 0) {
                  updateAi({ concurrency: Math.min(parsed, MAX_AI_CONCURRENCY) })
                }
              }}
              onBlur={() => setConcurrencyText(String(ai.concurrency ?? DEFAULT_AI_CONCURRENCY))}
              className="h-8 w-24 text-xs"
              data-testid="ai-concurrency-input"
            />
            <p className="text-[10px] text-muted-foreground">{t('settings.ai.concurrencyHint')}</p>
          </div>
        </div>
        {/* Full width under both: the check reports on the declared window and offers a better
          number, which is a sentence, not a field. */}
        <AiContextWindowCheck />

        {/* The escape hatch, last and full width: it is the only field here whose correct value the
          app cannot even guess at, since it exists precisely for what no two servers spell the same
          way. Buffered as text and only persisted once it parses — a half-typed object must not
          reach the transport, where it would fail every call with an HTTP 400. */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">
            {t('settings.ai.extraBody')}
          </label>
          <Textarea
            rows={3}
            spellCheck={false}
            value={extraBodyText}
            onChange={(e) => {
              setExtraBodyText(e.target.value)
              const parsed = parseExtraBody(e.target.value)
              setExtraBodyError(parsed.error)
              if (parsed.value !== undefined) updateAi({ extraBody: parsed.value })
            }}
            placeholder={'{ "reasoning_effort": "none" }'}
            className="min-h-0 resize-y font-mono text-[11px]"
            data-testid="ai-extra-body-input"
          />
          <p className="text-[10px] text-muted-foreground">{t('settings.ai.extraBodyHint')}</p>
          {extraBodyError && (
            <p className="text-[10px] text-tone-danger" data-testid="ai-extra-body-error">
              {t('settings.ai.extraBodyInvalid')}
            </p>
          )}
        </div>
      </SettingsGroup>
    </div>
  )
}
