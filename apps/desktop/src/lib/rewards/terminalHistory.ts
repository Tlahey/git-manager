/**
 * Tells apart "the user just ran this git command" from "this git command was already in the shell
 * history before the app ever looked" — the difference between a reward that was earned and one that
 * was fabricated.
 *
 * The reward engine treats every `terminal_command` event as something the user did (see
 * `rules/TerminalKeywordRule.ts`). The shell history is a *file*, though: reading it says nothing
 * about when its lines got there. Replaying it wholesale, as the store used to, handed out
 * `git diff`/`git log`/`git bisect` trophies the moment the Rewards tab was opened, for commands
 * typed weeks earlier in another project — nothing the user did in the app caused those unlocks,
 * which is exactly what a reward is supposed to signal.
 *
 * So the store keeps the last list it read (`terminalHistorySnapshot`) and only raises events for
 * what got **appended** since. Two properties make that safe:
 *
 * - **The first read never fires anything.** A `null` snapshot means "not watching yet": the store
 *   records what is already there and stays silent. Everything after that is, by construction, a
 *   command the user ran while the app was watching.
 * - **Ambiguity resolves to silence.** The backend returns a sliding window (the last 100 git
 *   commands), so a poll sees the previous list shifted left with new entries at the tail. When no
 *   overlap can be found at all — history cleared, file rewritten, or more than a window's worth of
 *   commands run between two polls — nothing is reported and the next snapshot re-baselines. Missing
 *   an unlock is recoverable (run the command again); inventing one is not.
 *
 * Timestamps would be the direct answer, and are deliberately not used: zsh only writes them under
 * `EXTENDED_HISTORY` and bash only under `HISTTIMEFORMAT`, so half the users' histories are bare
 * command lines. Positional diffing works the same either way.
 */

/** Whether two reads of the history are the same list — the store's cue to do nothing at all rather
 * than rewrite an equal snapshot, which its `persist` middleware would turn into a localStorage
 * write and a notification to every subscriber on each poll. */
export function sameCommands(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((command, i) => command === b[i])
}

/**
 * The commands appended to the shell history since `previous` was observed.
 *
 * Both lists are oldest-first windows over the same history. Returns `current` in full when
 * `previous` is empty (nothing was being watched yet, so every line arrived after the baseline),
 * and `[]` when the two windows share no overlap (see the module comment: unexplained means
 * silent).
 *
 * The store never passes an empty `previous`: it refuses to snapshot an empty read, since a read
 * that came back empty is indistinguishable from one that failed, and taking it at face value would
 * make the next read look entirely new.
 */
export function appendedCommands(previous: string[], current: string[]): string[] {
  if (previous.length === 0) return current
  if (current.length === 0) return []

  // Largest overlap first: it yields the *fewest* new commands, which is the conservative reading
  // when a repeated command line makes several alignments possible.
  for (let overlap = Math.min(previous.length, current.length); overlap >= 1; overlap--) {
    if (tailMatches(previous, current, overlap)) return current.slice(overlap)
  }
  return []
}

/** Whether `previous`' last `overlap` entries are `current`' first `overlap` entries — i.e. the two
 * windows line up with `overlap` commands in common. */
function tailMatches(previous: string[], current: string[], overlap: number): boolean {
  const offset = previous.length - overlap
  for (let i = 0; i < overlap; i++) {
    if (previous[offset + i] !== current[i]) return false
  }
  return true
}
