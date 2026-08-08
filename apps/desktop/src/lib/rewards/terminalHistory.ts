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
 * So the store keeps the last read (`terminalHistorySnapshot`) and only raises events for what got
 * **appended** since. Three properties make that safe:
 *
 * - **The first read never fires anything.** A `null` snapshot means "not watching yet": the store
 *   records what is already there and stays silent. Everything after that is, by construction, a
 *   command the user ran while the app was watching. Same for a history file seen for the first
 *   time, which is why the snapshot is keyed per file.
 * - **Ambiguity resolves to silence.** The backend returns a sliding window (each file's last 100 git
 *   commands), so a poll sees the previous list shifted left with new entries at the tail. When no
 *   overlap can be found at all — history cleared, file rewritten, or more than a window's worth of
 *   commands run between two polls — nothing is reported and that file re-baselines. Missing an
 *   unlock is recoverable (run the command again); inventing one is not.
 * - **One file, one stream.** Positional diffing only holds on an append-only list, so each history
 *   file is diffed on its own. The backend used to concatenate `.zsh_history` and `.bash_history`
 *   into one list, which silently defeated it: a command appended to the live zsh history landed in
 *   the *middle*, before the bash block, so it looked like a rewritten history and was never
 *   credited — for anyone holding git commands in both files, the terminal achievements were simply
 *   unreachable.
 *
 * Timestamps would be the direct answer, and are deliberately not used: zsh only writes them under
 * `EXTENDED_HISTORY` and bash only under `HISTTIMEFORMAT`, so half the users' histories are bare
 * command lines. Positional diffing works the same either way.
 */
import type { TerminalHistorySource } from '@git-manager/git-types'

/** The last read of every history file, keyed by file name (`.zsh_history`, `.bash_history`). */
export type TerminalHistorySnapshot = Record<string, string[]>

/** What one read of the shell history means: the commands to credit the user with, and the snapshot
 * to compare the next read against. */
export interface HistoryDiff {
  /** Commands appended since the previous read, across every file, oldest first per file. */
  appended: string[]
  snapshot: TerminalHistorySnapshot
}

/**
 * Diffs one read of the history files against the previous one.
 *
 * A file absent from `sources` keeps its previous snapshot rather than being dropped: an empty or
 * unreadable file is reported as absent, and that is indistinguishable from a failed read — forgetting
 * it would make its next read look entirely new. A file *not yet* in `previous` is baselined instead,
 * silently, which is what makes both a fresh install and a newly created history file safe.
 */
export function diffHistorySources(
  previous: TerminalHistorySnapshot,
  sources: TerminalHistorySource[]
): HistoryDiff {
  const snapshot: TerminalHistorySnapshot = { ...previous }
  const appended: string[] = []

  for (const { source, commands } of sources) {
    if (commands.length === 0) continue
    const seen = snapshot[source]
    // Unknown file: baseline it, credit nothing.
    if (seen !== undefined) appended.push(...appendedCommands(seen, commands))
    snapshot[source] = commands
  }

  return { appended, snapshot }
}

/** Whether two snapshots hold the same files with the same commands — the store's cue to do nothing
 * at all rather than rewrite an equal snapshot, which its `persist` middleware would turn into a
 * localStorage write and a notification to every subscriber on each poll. */
export function sameSnapshot(a: TerminalHistorySnapshot, b: TerminalHistorySnapshot): boolean {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) => b[key] !== undefined && sameCommands(a[key], b[key]))
}

/** Whether two reads of one history file are the same list. */
export function sameCommands(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((command, i) => command === b[i])
}

/**
 * The commands appended to **one** history file since `previous` was observed.
 *
 * Both lists are oldest-first windows over the same file. Returns `[]` when the two windows share no
 * overlap (see the module comment: unexplained means silent), and `current` in full when `previous`
 * is empty — a case `diffHistorySources` never produces, since a file with no commands is reported
 * as absent and an unknown file is baselined rather than diffed.
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
