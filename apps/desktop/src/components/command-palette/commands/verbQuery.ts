/**
 * The query split into a leading verb word and whatever the user typed after it — `"checkout ada"`
 * → `{ head: 'checkout', rest: 'ada' }`. `null` when there is no space yet, i.e. nothing has been
 * named for the verb to act on.
 */
export interface VerbQuery {
  head: string
  rest: string
}

/** Shortest abbreviation accepted for a verb word, so `re ` can't mean rebase *and* rename. */
const MIN_PREFIX = 3

/**
 * Reads `<verb> <something>` out of the palette query.
 *
 * Returns `null` for a query with no argument yet ("checkout", "checkout ") — that is the state
 * where the verb's own row is the answer, and offering branches for it would put the whole list
 * back on screen, which is the thing the two-step flow exists to avoid.
 */
export function parseVerbQuery(query: string): VerbQuery | null {
  const trimmed = query.trim()
  const at = trimmed.search(/\s/)
  if (at === -1) return null

  const rest = trimmed.slice(at + 1).trim()
  if (!rest) return null

  return { head: trimmed.slice(0, at).toLowerCase(), rest }
}

/**
 * Whether `head` names this verb: one of its words in full, or an abbreviation of at least
 * {@link MIN_PREFIX} characters. Both forms are needed — `ff` is a whole word shorter than the
 * minimum, and `reb` has to be enough to mean rebase without also meaning rename.
 *
 * Ambiguity is resolved by showing *both* verbs' rows rather than guessing: `delete` prefixes both
 * `delete` and `delete-remote`, and each row says which one it is.
 */
export function matchesVerb(head: string, words: string[]): boolean {
  return words.some((word) => word === head || (head.length >= MIN_PREFIX && word.startsWith(head)))
}
