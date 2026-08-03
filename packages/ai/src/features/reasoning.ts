/**
 * Removes a model's visible deliberation from an answer meant for a human.
 *
 * Reasoning models narrate before they answer. When the answer is schema-constrained the grammar
 * suppresses it, which is why the structured features never needed this — but the streamed ones have
 * no such guard, and a user asking about their history got a "Thinking Process" section followed by
 * an answer cut off mid-sentence, the deliberation having eaten the token budget.
 *
 * Three shapes are handled, and deliberately no more:
 *
 *  - **Tagged blocks** (`<think>`, `<thinking>`, `<reasoning>`), the convention most models use. An
 *    *unclosed* opening tag also truncates, because during streaming the closing tag has not
 *    arrived yet and showing the raw thoughts until it does is exactly the bug.
 *  - **A leading heading** that is about thinking rather than about the answer, on its own line.
 *  - **A leading label with the deliberation running on from it** — `Thinking Process: 1. Analyze
 *    the request…` — which is what models actually emit far more often than a tidy heading, and
 *    which the first version of this missed entirely because it required a newline after the word.
 *
 * All three only at the very start, and only up to the next heading: a model that opens with
 * "Thinking Process" is narrating, while the same words further down would be the user's own
 * content. Anything else is left alone. Guessing harder here risks eating a real answer, which is a
 * worse failure than showing some deliberation.
 */

/** Words that mean "I am about to think", in the languages the app writes in. */
const NARRATION =
  '(?:thinking(?:\\s+process)?|thought\\s+process|reasoning|analysis|réflexion|raisonnement)'

/**
 * The marker on its own line: `## Thinking Process`, `**Reasoning**`.
 *
 * A markdown prefix is required here, and the word must be the *whole* heading: `## Analysis
 * tooling` is a section of a real answer about a linter, and eating it would be a far worse failure
 * than leaving a little deliberation on screen.
 */
const NARRATION_HEADING = new RegExp(
  `^\\s*(?:#{1,6}\\s*|\\*\\*)\\s*${NARRATION}\\s*:?\\s*\\*{0,2}[ \t]*\n`,
  'i'
)

/**
 * The marker as a label, with the deliberation continuing on the same line.
 *
 * No markdown prefix is required — models rarely bother — so the **colon carries the safety** here
 * instead: `Thinking Process:` is a label, `Analysis tooling` is not, and the distinction is exactly
 * the punctuation. This is the form a real answer leaked past the heading-only version with.
 */
const NARRATION_LABEL = new RegExp(
  // The bold markers fall on either side of the colon depending on the model — `**Reasoning**:` and
  // `**Réflexion :**` are both common — so both positions are optional and both are consumed.
  `^\\s*\\*{0,2}${NARRATION}\\*{0,2}\\s*:\\s*\\*{0,2}[ \t]*`,
  'i'
)

/** Opening/closing tag pairs, and a lone opener that has not closed yet. */
const TAGGED_BLOCK = /<(think|thinking|reasoning|analysis)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi

/**
 * Where the answer proper begins: a line that opens a heading or a bold sentence.
 *
 * Both are required of the answers this strips (see `commitSearchAnswerFeature`'s instruction), and
 * neither can appear *inside* a narration's numbered list, where the bold lands mid-line after
 * `1. ` rather than at the start of one.
 */
const ANSWER_START = /^\s*#{1,6}\s|^\s*\*\*/m

export function stripReasoning(text: string): string {
  let out = text.replace(TAGGED_BLOCK, '')

  // A leading narration: drop it up to where the answer starts, or entirely when nothing does —
  // which is what a still-streaming answer looks like before it reaches its first real heading.
  const marker = NARRATION_HEADING.exec(out) ?? NARRATION_LABEL.exec(out)
  if (marker) {
    const rest = out.slice(marker[0].length)
    const next = rest.search(ANSWER_START)
    out = next === -1 ? '' : rest.slice(next)
  }

  return out.trimStart()
}
