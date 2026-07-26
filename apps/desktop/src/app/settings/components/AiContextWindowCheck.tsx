import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { DEFAULT_CONTEXT_TOKENS } from '@git-manager/ai'
import { Button } from '@git-manager/ui'
import { apiGetModelContextLimits } from '../../../api/ai.api'
import { useSettingsStore } from '../../../stores/settings.store'

type CheckState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  /** The provider had nothing to say — not an error, just no answer (see `ai_model_info.rs`). */
  | { kind: 'unknown' }
  | { kind: 'answered'; architectureMax: number | null; modelfileNumCtx: number | null }
  | { kind: 'failed'; message: string }

/**
 * Checks the declared context window against what the provider actually reports.
 *
 * The setting it guards is the one thing in the AI stack taken purely on faith: nothing negotiates a
 * context window, so declaring more than the provider serves rebuilds the silent truncation the
 * setting exists to prevent — and worse than before, because the app then constructs an oversized
 * prompt deliberately.
 *
 * Deliberately a button rather than an automatic check. It is a network round-trip to a provider
 * that may not be running, on a page the user opens for many other reasons, and a Settings field
 * that fires HTTP on every keystroke is its own bug.
 *
 * The copy never claims more than it knows. `/api/show` reports the model's architectural ceiling
 * and any `num_ctx` its Modelfile pins; it cannot see a window set through `OLLAMA_CONTEXT_LENGTH`,
 * which is server-side. So a value that passes is *plausible*, never *verified* — and only a value
 * above the architectural ceiling is called out as wrong, because that one cannot be right.
 */
export function AiContextWindowCheck() {
  const { t } = useTranslation('settings')
  const ai = useSettingsStore((s) => s.settings.ai)
  const [state, setState] = useState<CheckState>({ kind: 'idle' })

  const declared = ai.contextTokens ?? DEFAULT_CONTEXT_TOKENS

  async function check() {
    setState({ kind: 'checking' })
    try {
      const limits = await apiGetModelContextLimits(ai.url, ai.model)
      setState(
        limits.architectureMax === null && limits.modelfileNumCtx === null
          ? { kind: 'unknown' }
          : { kind: 'answered', ...limits }
      )
    } catch (err) {
      setState({ kind: 'failed', message: String(err) })
    }
  }

  // Only the architectural ceiling can prove the setting wrong. A Modelfile `num_ctx` below it is
  // reported but not treated as a verdict: the running server may well override it.
  const exceedsCeiling =
    state.kind === 'answered' &&
    state.architectureMax !== null &&
    declared > state.architectureMax

  return (
    <div className="space-y-1">
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-[11px]"
        onClick={() => void check()}
        disabled={state.kind === 'checking' || !ai.model}
        data-testid="ai-context-check-button"
      >
        {state.kind === 'checking'
          ? t('settings.ai.contextCheckRunning')
          : t('settings.ai.contextCheck')}
      </Button>

      {state.kind === 'unknown' && (
        <p className="text-[10px] text-muted-foreground" data-testid="ai-context-check-result">
          {t('settings.ai.contextCheckUnknown')}
        </p>
      )}

      {state.kind === 'failed' && (
        <p className="break-words text-[10px] text-tone-danger" data-testid="ai-context-check-result">
          {state.message}
        </p>
      )}

      {state.kind === 'answered' && (
        <p
          className={`text-[10px] ${exceedsCeiling ? 'text-tone-danger' : 'text-muted-foreground'}`}
          data-testid="ai-context-check-result"
        >
          {state.architectureMax !== null &&
            t('settings.ai.contextCheckMax', { max: state.architectureMax })}{' '}
          {state.modelfileNumCtx !== null &&
            t('settings.ai.contextCheckModelfile', { numCtx: state.modelfileNumCtx })}{' '}
          {exceedsCeiling
            ? t('settings.ai.contextCheckTooHigh', { declared })
            : t('settings.ai.contextCheckPlausible')}
        </p>
      )}
    </div>
  )
}
