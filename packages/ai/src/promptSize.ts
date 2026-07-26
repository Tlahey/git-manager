/**
 * Sizing a prompt against a model's context window, before a provider silently mangles it.
 *
 * Context overflow is the worst-behaved failure in the whole AI stack: it does not raise, it does not
 * warn, and it does not truncate the *end*. A provider handed more tokens than its window drops them
 * from the **start** — which is exactly where the system instruction lives. The symptom is a feature
 * that quietly stops obeying its own output rules, with nothing anywhere saying why.
 *
 * The answer is to never build such a prompt: {@link variableCharBudget} tells a feature how much
 * variable content it may carry, so the prompt shrinks to fit rather than overflowing, and
 * {@link contextTokensFor} inverts that to say what window would have carried it whole.
 *
 * An earlier version instead *measured* finished prompts and graded them (ok / tight / over). That
 * was the right tool for a fixed budget and became dead weight once the budget followed the window:
 * a prompt built this way cannot be "over". Only the sizing survives.
 */

/**
 * Characters per token, used to turn a prompt's length into a token estimate.
 *
 * Deliberately lower than the ~4 usually quoted for English prose. This prompt is mostly diff: dense
 * punctuation, indentation, identifiers split into several tokens each — all of which tokenize worse
 * than prose. And the error is not symmetric. Under-estimating means staying quiet while the
 * instruction is being cut off, which is the failure this module exists to surface; over-estimating
 * means one warning too many, which costs a glance.
 */
const CHARS_PER_TOKEN = 3.5

/**
 * Context window used when the connection declares none, in tokens.
 *
 * Ollama's default for most models unless the Modelfile (or a newer `OLLAMA_CONTEXT_LENGTH`) says
 * otherwise. Deliberately pessimistic: a user running a 128k model still gets this from Ollama
 * unless they configured it, so defaulting to anything larger would make the warning useless
 * precisely for the people who need it — while a user who *has* configured their window can say so
 * in Settings (`AiConnectionConfig.contextTokens`).
 */
export const DEFAULT_CONTEXT_TOKENS = 4096

/**
 * Tokens to leave for the model's own answer. A review is capped at 300 words — call it 500 tokens,
 * rounded up, because a window has to hold the question *and* the answer.
 */
const RESERVED_OUTPUT_TOKENS = 600

/**
 * Rough token count for a string. An estimate, not a tokenizer: a real one is model-specific and
 * would mean shipping vocabulary files for a number whose only job is to decide whether to show a
 * sentence.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/**
 * How many characters of *variable* content a prompt may carry to stay inside `contextTokens`,
 * given the fixed overhead it always sends (its instruction, its headers).
 *
 * This is what lets a feature's budget follow the model instead of being a second hardcoded guess
 * beside the window. The 0.85 factor is deliberate slack: {@link estimateTokens} is an estimate, and
 * being 15 % wrong in the safe direction costs a little coverage, while being wrong the other way
 * costs the instruction — silently.
 */
export function variableCharBudget(contextTokens: number, fixedOverheadTokens: number): number {
  const usable = contextTokens - fixedOverheadTokens - RESERVED_OUTPUT_TOKENS
  return Math.max(0, Math.floor(usable * SAFETY_FACTOR * CHARS_PER_TOKEN))
}

/** See {@link variableCharBudget}. Named so the inverse below cannot drift from it. */
const SAFETY_FACTOR = 0.85

/**
 * The inverse of {@link variableCharBudget}: the smallest context window that would carry `chars` of
 * variable content whole.
 *
 * Lives here rather than at the call site so the three constants behind the budget (characters per
 * token, the output reserve, the safety factor) stay in one file. A caller re-deriving them would
 * drift the moment one is tuned.
 */
export function contextTokensFor(chars: number, fixedOverheadTokens: number): number {
  return Math.ceil(
    chars / (SAFETY_FACTOR * CHARS_PER_TOKEN) + fixedOverheadTokens + RESERVED_OUTPUT_TOKENS
  )
}
