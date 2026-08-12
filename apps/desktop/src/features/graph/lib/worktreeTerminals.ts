import type { GitWorktree, TerminalStatus } from '@git-manager/git-types'
import type { TerminalSession } from '../../../stores/terminal.store'

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
  /** True while at least one of them is running a command. */
  busy: boolean
  /** The running command's name, when one could be resolved (`claude`, `pnpm`). */
  command: string | null
  /**
   * The session a click on the row should show: the busy one, else the most recently opened. A row
   * stands for a place, and the answer to "take me to what is happening there" is that session.
   */
  sessionId: string
}

/**
 * One summary per directory that has at least one session. Absent from the map = nothing running
 * there, which is what the callers test rather than a `count === 0` entry.
 */
export function summarizeWorktreeTerminals(
  sessions: TerminalSession[],
  activity: Record<string, TerminalStatus>
): Map<string, WorktreeTerminalSummary> {
  const summaries = new Map<string, WorktreeTerminalSummary>()
  for (const session of sessions) {
    const status = activity[session.id]
    const busy = status?.busy ?? false
    const current = summaries.get(session.cwd)
    if (!current) {
      summaries.set(session.cwd, {
        count: 1,
        busy,
        command: busy ? (status?.command ?? null) : null,
        sessionId: session.id,
      })
      continue
    }
    current.count += 1
    // A busy session wins the click target, and the first busy one keeps it: two agents on one
    // worktree is not a case worth arbitrating, and swapping the target under the pointer as the
    // poll comes back would be worse than picking either.
    if (busy && !current.busy) {
      current.busy = true
      current.command = status?.command ?? null
      current.sessionId = session.id
    } else if (!current.busy) {
      current.sessionId = session.id
    }
  }
  return summaries
}

/**
 * Worktrees reordered so the ones being worked in come first: running a command beats merely having
 * a shell open, which beats nothing. Ties keep the incoming order — `git worktree list`'s, which is
 * stable — so the list only ever moves for a reason the user can see.
 */
export function sortWorktreesByTerminal(
  worktrees: GitWorktree[],
  summaries: Map<string, WorktreeTerminalSummary>
): GitWorktree[] {
  const rank = (wt: GitWorktree) => {
    const summary = summaries.get(wt.path)
    if (!summary) return 2
    return summary.busy ? 0 : 1
  }
  // A copy, sorted stably (the language guarantees it): the array belongs to the query cache.
  return [...worktrees].sort((a, b) => rank(a) - rank(b))
}
