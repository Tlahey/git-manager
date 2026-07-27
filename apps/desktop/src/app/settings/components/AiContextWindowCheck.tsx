import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { DEFAULT_CONTEXT_TOKENS } from '@git-manager/ai'
import { Button } from '@git-manager/ui'
import { apiGetModelContextLimits } from '../../../api/ai.api'
import type { ModelContextLimits } from '../../../lib/tauri'
import { useSettingsStore } from '../../../stores/settings.store'
import {
  contextWindowVerdict,
  isHarmfulVerdict,
  type ContextWindowVerdict,
} from './aiContextWindowVerdict'

type CheckState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  /** The provider had nothing to say — not an error, just no answer (see `ai_model_info.rs`). */
  | { kind: 'unknown' }
  | { kind: 'answered'; limits: ModelContextLimits }
  | { kind: 'failed'; message: string }

/** The sentence that states the verdict. Split out so the component renders a lookup rather than a
 * chain of ternaries, and so adding a verdict cannot silently render nothing. */
const VERDICT_KEYS: Record<ContextWindowVerdict, string> = {
  'above-ceiling': 'settings.ai.contextCheckTooHigh',
  'above-allocated': 'settings.ai.contextCheckAboveAllocated',
  'below-allocated': 'settings.ai.contextCheckBelowAllocated',
  'matches-allocated': 'settings.ai.contextCheckMatchesAllocated',
  plausible: 'settings.ai.contextCheckPlausible',
}

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
 * The copy never claims more than it knows, and what it can know changed. `/api/show` reports the
 * model's architectural ceiling and any `num_ctx` its Modelfile pins — neither of which sees a
 * server-side `OLLAMA_CONTEXT_LENGTH`. `/api/ps` does: while a model is loaded it reports the window
 * the server *allocated* for it, which is the number prompts are really measured against. So a
 * declared value can now be genuinely verified — but only while the model is loaded, and everything
 * else is still called plausible rather than proven. See {@link contextWindowVerdict}.
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
      const answered =
        limits.architectureMax !== null ||
        limits.modelfileNumCtx !== null ||
        limits.allocatedContext !== null
      setState(answered ? { kind: 'answered', limits } : { kind: 'unknown' })
    } catch (err) {
      setState({ kind: 'failed', message: String(err) })
    }
  }

  const verdict = state.kind === 'answered' ? contextWindowVerdict(declared, state.limits) : null

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

      {state.kind === 'answered' && verdict !== null && (
        <p
          className={`text-[10px] ${
            isHarmfulVerdict(verdict) ? 'text-tone-danger' : 'text-muted-foreground'
          }`}
          data-testid="ai-context-check-result"
        >
          {/* The facts that were reported, then the verdict. Assembled and joined rather than
              interleaved with {' '}, because three optional sentences that way leave a stray space
              for every one the provider did not answer. */}
          {[
            state.limits.architectureMax !== null &&
              t('settings.ai.contextCheckMax', { max: state.limits.architectureMax }),
            state.limits.modelfileNumCtx !== null &&
              t('settings.ai.contextCheckModelfile', { numCtx: state.limits.modelfileNumCtx }),
            state.limits.allocatedContext !== null &&
              t('settings.ai.contextCheckAllocated', { allocated: state.limits.allocatedContext }),
            t(VERDICT_KEYS[verdict], {
              declared,
              allocated: state.limits.allocatedContext ?? 0,
            }),
          ]
            .filter((sentence): sentence is string => typeof sentence === 'string')
            .join(' ')}
        </p>
      )}
    </div>
  )
}
