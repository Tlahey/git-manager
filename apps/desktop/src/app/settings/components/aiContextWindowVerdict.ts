import type { ModelContextLimits } from '../../../lib/tauri'

/**
 * Turning what Ollama reported into one verdict about the declared context window.
 *
 * Pure and separate from the component because the interesting part is not the rendering — it is
 * *which* of three numbers gets to decide, and they do not carry the same authority:
 *
 * - `allocatedContext` (`/api/ps`) is what the server actually allocated for the model it has
 *   loaded. It is the only one that reflects a server-side `OLLAMA_CONTEXT_LENGTH`, which used to be
 *   invisible from here, and it is the number a prompt is genuinely measured against. When it is
 *   present it *decides*, in both directions — too high truncates, too low costs coverage for free.
 * - `architectureMax` (`/api/show`) is the model's own ceiling. It can only ever prove a value
 *   wrong, never right: a server can serve far less than the model supports.
 * - `modelfileNumCtx` (`/api/show`) is reported but never a verdict — the running server overrides
 *   it routinely, which is exactly what `allocatedContext` now shows.
 * - `servedMaxModelLen` (`GET /v1/models`) is what an OpenAI-compatible server says it serves for
 *   the model. Same authority as `architectureMax` — a declared ceiling, not proof of allocation —
 *   but it is the only signal available on a non-Ollama provider, and it is the one that catches the
 *   case this whole check exists for in reverse: a **default 4096 against a server offering 128000**,
 *   where nothing is broken and most of the diff is silently going unread.
 */
export type ContextWindowVerdict =
  /** Declared above the model's architectural ceiling — cannot be right under any server config. */
  | 'above-ceiling'
  /** Declared above the window the server allocated: prompts will lose their instruction. */
  | 'above-allocated'
  /** Declared below the allocated window: correct, but leaving readable diff on the table. */
  | 'below-allocated'
  /** Declared exactly what the server allocated. The only state that is genuinely verified. */
  | 'matches-allocated'
  /** Declared well below what the server reports it serves: nothing breaks, but most of a large diff
   * goes unread for no reason. The default 4096 on a 128k server lands here. */
  | 'below-served'
  /** Nothing contradicts it, but nothing confirms it either — the model was not loaded. */
  | 'plausible'

/**
 * Which verdict `declared` earns against `limits`.
 *
 * The ceiling is checked first even though the allocated window is the stronger signal: a value
 * above the architecture's maximum is wrong in a way that survives reloading the model with a
 * different `OLLAMA_CONTEXT_LENGTH`, so it is the more useful thing to say.
 */
export function contextWindowVerdict(
  declared: number,
  limits: ModelContextLimits
): ContextWindowVerdict {
  if (limits.architectureMax !== null && declared > limits.architectureMax) return 'above-ceiling'
  if (limits.servedMaxModelLen !== null && declared > limits.servedMaxModelLen) {
    return 'above-ceiling'
  }
  if (limits.allocatedContext !== null) {
    if (declared > limits.allocatedContext) return 'above-allocated'
    if (declared < limits.allocatedContext) return 'below-allocated'
    return 'matches-allocated'
  }
  // Only reached on a provider with no `/api/ps` — i.e. not Ollama — which is exactly where
  // `servedMaxModelLen` is the only thing we know.
  if (limits.servedMaxModelLen !== null && declared < limits.servedMaxModelLen) {
    return 'below-served'
  }
  return 'plausible'
}

/**
 * The window the check would set if the user accepted its advice, or `null` when it has no better
 * value to offer than the one already declared.
 *
 * Allocation beats a declared ceiling: `allocatedContext` is what the prompt is really measured
 * against, while `servedMaxModelLen` is the most the server would serve. Offering the latter is
 * still right on a provider that reports nothing else — it is the number the user would have had to
 * look up by hand, which is how a default 4096 survives in front of a 128k model.
 */
export function suggestedContextWindow(
  declared: number,
  limits: ModelContextLimits
): number | null {
  const best = limits.allocatedContext ?? limits.servedMaxModelLen
  return best !== null && best !== declared ? best : null
}

/** The verdicts that mean the setting is actively harmful, rather than merely unconfirmed. */
export function isHarmfulVerdict(verdict: ContextWindowVerdict): boolean {
  return verdict === 'above-ceiling' || verdict === 'above-allocated'
}
