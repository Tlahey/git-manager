import useSWR from 'swr'
import type { TerminalStatus } from '@git-manager/git-types'
import { apiTerminalStatus } from '../api/terminal.api'
import { useTerminalStore } from '../stores/terminal.store'

const EMPTY: Record<string, TerminalStatus> = {}

/**
 * Live busy/idle state of every integrated-terminal session, keyed by session id.
 *
 * Polled — like `useWorktreeAgentActivity`, and for the same reason: "a command is running" is a
 * state to sample, not an event to subscribe to. The backend reads the PTY's foreground process
 * group (see `services/terminal_pty.rs`), so a session reads busy while an agent is thinking
 * silently and idle the instant its prompt comes back — neither of which an output-timing heuristic
 * gets right.
 *
 * The poll stops dead when there is no session: the SWR key goes `null`, and nothing is asked of
 * the backend until a terminal is opened.
 *
 * Each answer is also folded into the store's finished/seen bookkeeping. That happens *in the
 * fetcher* rather than in an effect because the fetcher is the one place that runs once per poll:
 * SWR dedupes it across every mounted copy of this hook, where an effect would fire once per
 * component. `syncActivity` is idempotent anyway, so a stray extra call changes nothing — the
 * fetcher is simply where it belongs.
 */
export function useTerminalActivity(): Record<string, TerminalStatus> {
  const sessionCount = useTerminalStore((s) => s.sessions.length)
  const { data } = useSWR<Record<string, TerminalStatus>, Error>(
    sessionCount > 0 ? ['terminal-activity', sessionCount] : null,
    async () => {
      const statuses = await apiTerminalStatus()
      const byId = Object.fromEntries(statuses.map((status) => [status.id, status]))
      useTerminalStore.getState().syncActivity(byId)
      return byId
    },
    { refreshInterval: 2000, revalidateOnFocus: true }
  )
  return data ?? EMPTY
}
