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
  if (limits.allocatedContext === null) return 'plausible'
  if (declared > limits.allocatedContext) return 'above-allocated'
  if (declared < limits.allocatedContext) return 'below-allocated'
  return 'matches-allocated'
}

/** The verdicts that mean the setting is actively harmful, rather than merely unconfirmed. */
export function isHarmfulVerdict(verdict: ContextWindowVerdict): boolean {
  return verdict === 'above-ceiling' || verdict === 'above-allocated'
}
