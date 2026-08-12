import type { GitWorktree, TerminalStatus } from '@git-manager/git-types'
import type { TerminalFinished, TerminalSession } from '../../../stores/terminal.store'
import { terminalSessionState, type TerminalSessionState } from '../../../lib/terminalState'

/**
 * Reading the integrated terminal's sessions as a fact *about the worktrees*.
 *
 * The sidebar's two terminal-aware surfaces both need the same reduction — "what is happening in
 * this directory" — and neither of them is the terminal panel: the Terminals section lists the
 * sessions of this repository, and the Worktrees section marks the rows something is running in and
 * floats them to the top. Both are pure functions of the session list plus the polled activity map,
 * which is what keeps them out of a component and under test.
 */

/** What the sidebar shows about one directory's terminals. */
export interface WorktreeTerminalSummary {
  /** How many live sessions are bound to that directory. */
  count: number
  /**
   * The loudest state among them: `busy` if anything is running there, else `done` if something
   * finished that the user has not looked at, else `idle`.
   */
  state: TerminalSessionState
  /** The name of the command that state is about, when one could be resolved. */
  command: string | null
  /**
   * The session a click on the row should show: the one the state came from — the busy session,
   * else the one with news, else the most recently opened. A row stands for a place, and the answer
   * to "take me to what is happening there" is that session.
   */
  sessionId: string
}

/** How loudly a state asks to be looked at — the order the summary and the rows are ranked by. */
const PRIORITY: Record<TerminalSessionState, number> = { busy: 0, done: 1, idle: 2 }

/**
 * One summary per directory that has at least one session. Absent from the map = no terminal there
 * at all, which is what the callers test rather than a `count === 0` entry.
 */
export function summarizeWorktreeTerminals(
  sessions: TerminalSession[],
  activity: Record<string, TerminalStatus>,
  finished: Record<string, TerminalFinished> = {}
): Map<string, WorktreeTerminalSummary> {
  const summaries = new Map<string, WorktreeTerminalSummary>()
  for (const session of sessions) {
    const status = activity[session.id]
    const busy = status?.busy ?? false
    const state = terminalSessionState(busy, session.id in finished)
    const command = busy ? (status?.command ?? null) : (finished[session.id]?.command ?? null)
    const current = summaries.get(session.cwd)
    if (!current) {
      summaries.set(session.cwd, { count: 1, state, command, sessionId: session.id })
      continue
    }
    current.count += 1
    // The loudest state wins the row, and the *first* session in that state keeps the click:
    // two agents on one worktree is not a case worth arbitrating, and swapping the target under
    // the pointer as the poll comes back would be worse than picking either. A later session only
    // takes over when it is strictly louder — or when neither has anything to say, where the most
    // recent one is the better guess.
    if (
      PRIORITY[state] < PRIORITY[current.state] ||
      (state === 'idle' && current.state === 'idle')
    ) {
      current.state = state
      current.command = command
      current.sessionId = session.id
    }
  }
  return summaries
}

/**
 * Worktrees reordered so the ones worth looking at come first: running a command, then having
 * finished one nobody has read, then merely having a shell open, then nothing. Ties keep the
 * incoming order — `git worktree list`'s, which is stable — so the list only ever moves for a
 * reason the user can see.
 */
export function sortWorktreesByTerminal(
  worktrees: GitWorktree[],
  summaries: Map<string, WorktreeTerminalSummary>
): GitWorktree[] {
  const rank = (wt: GitWorktree) => {
    const summary = summaries.get(wt.path)
    return summary ? PRIORITY[summary.state] : 3
  }
  // A copy, sorted stably (the language guarantees it): the array belongs to the query cache.
  return [...worktrees].sort((a, b) => rank(a) - rank(b))
}
