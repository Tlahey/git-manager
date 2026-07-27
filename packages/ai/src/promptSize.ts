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
 * A pessimistic floor rather than "the provider's default", which is not a single number: Ollama
 * sizes its own default from available memory (roughly 4k below 24 GiB of VRAM, 32k up to 48 GiB,
 * 256k above), and a Modelfile or `OLLAMA_CONTEXT_LENGTH` overrides that again. 4096 is what the
 * majority of machines get, and being wrong low costs coverage while being wrong high costs the
 * instruction — so the floor is the safe end. A user who knows their window says so in Settings
 * (`AiConnectionConfig.contextTokens`), where the check button can now verify it against what the
 * server actually allocated.
 */
export const DEFAULT_CONTEXT_TOKENS = 4096

/**
 * Default tokens to leave for the model's own answer. A review is capped at 300 words — call it 500
 * tokens, rounded up, because a window has to hold the question *and* the answer.
 *
 * The reserve is not only subtracted from the prompt's budget: it is also *sent*, as `max_tokens`
 * (see `resolveGenerateConfig`), so the model is actually held to it. Subtracting alone reserved the
 * room without obliging anyone to stay inside it, and an answer that runs past the reserve overflows
 * the very window the prompt was sized against — dropping tokens from the *start*, where the
 * instruction lives.
 *
 * **The two uses must stay one number**, per feature. A cap larger than the reserve overflows the
 * window; a smaller one truncates answers to buy room nobody spends. Which is why the reserve is a
 * *parameter* of the two functions below rather than a constant they close over: most features
 * answer in prose and 600 is generous, but one answers with a JSON document whose length is a
 * function of its input (see `fileGrouping`), and it needs the same larger number on both sides or
 * the pairing breaks.
 *
 * `max_tokens` is supported by the OpenAI-compatible chat-completions surface every shipped preset
 * speaks — the *context window* is not, which is why `contextTokens` is still declared in Settings
 * rather than negotiated.
 */
export const RESERVED_OUTPUT_TOKENS = 600

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
export function variableCharBudget(
  contextTokens: number,
  fixedOverheadTokens: number,
  reservedOutputTokens: number = RESERVED_OUTPUT_TOKENS
): number {
  const usable = contextTokens - fixedOverheadTokens - reservedOutputTokens
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
export function contextTokensFor(
  chars: number,
  fixedOverheadTokens: number,
  reservedOutputTokens: number = RESERVED_OUTPUT_TOKENS
): number {
  return Math.ceil(
    chars / (SAFETY_FACTOR * CHARS_PER_TOKEN) + fixedOverheadTokens + reservedOutputTokens
  )
}
