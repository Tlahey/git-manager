import { useCallback } from 'react'
import { useTerminalStore } from '../stores/terminal.store'
import { apiTerminalOpen } from '../api/terminal.api'
import { disposeTerminal, getOrCreateTerminal } from '../lib/terminalRegistry'

export interface UseIntegratedTerminal {
  /** Whether the bottom terminal dock is currently open. */
  open: boolean
  /** Opens a new shell session bound to `path` — the repo/worktree currently on screen. */
  addSession: () => Promise<void>
  /** Kills a session and removes it from the list. */
  closeSession: (id: string) => void
  /** Kills every live session and closes the panel. */
  closeAllSessions: () => void
  /** Opens the panel, spawning a first session only when none exists anywhere. */
  openTerminal: () => Promise<void>
  /** Toggles the panel: closes if open, otherwise opens (spawning a session when there are none). */
  toggle: () => Promise<void>
}

/**
 * Drives the integrated terminal from the repo/worktree `path` currently on screen: spawning and
 * closing PTY sessions (via the API layer + xterm registry) and opening/closing the dock.
 *
 * `path` is what a *new* session binds to, and nothing else. Reopening the panel restores whatever
 * session was last on screen even if it belongs to another worktree — see `terminal.store.ts` for
 * why the panel follows the session rather than the view. Which is also why the first session is
 * spawned only when there is none at all: pressing the toolbar button with an agent already running
 * means "show me my terminal back", not "start a second shell".
 *
 * All IPC goes through `api/terminal.api.ts`.
 */
export function useIntegratedTerminal(path: string | null): UseIntegratedTerminal {
  const open = useTerminalStore((s) => s.open)
  const addSessionToStore = useTerminalStore((s) => s.addSession)
  const removeSession = useTerminalStore((s) => s.removeSession)
  const openPanel = useTerminalStore((s) => s.openPanel)
  const closePanel = useTerminalStore((s) => s.closePanel)

  const addSession = useCallback(async () => {
    if (!path) return
    const count = useTerminalStore.getState().sessions.length
    const id = await apiTerminalOpen(path, 80, 24)
    // Create the xterm instance now so its output listener is attached before the shell prints.
    getOrCreateTerminal(id)
    // Numbered across every session rather than per directory: the tab strip shows them all, and
    // two "zsh 1" tabs side by side would name nothing.
    addSessionToStore({ id, title: `zsh ${count + 1}`, cwd: path })
  }, [path, addSessionToStore])

  const closeSession = useCallback(
    (id: string) => {
      disposeTerminal(id)
      removeSession(id)
    },
    [removeSession]
  )

  const closeAllSessions = useCallback(() => {
    for (const session of useTerminalStore.getState().sessions) {
      disposeTerminal(session.id)
      removeSession(session.id)
    }
    closePanel()
  }, [removeSession, closePanel])

  const openTerminal = useCallback(async () => {
    openPanel()
    if (useTerminalStore.getState().sessions.length === 0) {
      await addSession()
    }
  }, [openPanel, addSession])

  const toggle = useCallback(async () => {
    if (useTerminalStore.getState().open) {
      closePanel()
    } else {
      await openTerminal()
    }
  }, [closePanel, openTerminal])

  return { open, addSession, closeSession, closeAllSessions, openTerminal, toggle }
}
