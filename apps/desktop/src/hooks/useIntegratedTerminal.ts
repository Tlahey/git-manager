import { useCallback } from 'react'
import { useTerminalStore } from '../stores/terminal.store'
import { apiTerminalOpen } from '../api/terminal.api'
import { disposeTerminal, getOrCreateTerminal } from '../lib/terminalRegistry'

export interface UseIntegratedTerminal {
  /** Whether the bottom terminal dock is currently open. */
  open: boolean
  /** Opens a new shell session (tab) rooted at the active repo/worktree path. */
  addSession: () => Promise<void>
  /** Kills a session and removes its tab. */
  closeSession: (id: string) => void
  /** Opens the panel, spawning a first session if none exist yet. */
  openTerminal: () => Promise<void>
  /** Toggles the panel: closes if open, otherwise opens (spawning a session when empty). */
  toggle: () => Promise<void>
}

/**
 * Drives the integrated terminal for a given repo/worktree `path`: spawning/closing PTY sessions
 * (via the API layer + xterm registry) and opening/closing the dock. Sessions are keyed by `path`
 * so each repo/worktree keeps its own set of shells. All IPC goes through `api/terminal.api.ts`.
 */
export function useIntegratedTerminal(path: string | null): UseIntegratedTerminal {
  const open = useTerminalStore((s) => s.open)
  const addTab = useTerminalStore((s) => s.addTab)
  const removeTab = useTerminalStore((s) => s.removeTab)
  const openPanel = useTerminalStore((s) => s.openPanel)
  const closePanel = useTerminalStore((s) => s.closePanel)

  const addSession = useCallback(async () => {
    if (!path) return
    const count = useTerminalStore.getState().tabsFor(path).tabs.length
    const id = await apiTerminalOpen(path, 80, 24)
    // Create the xterm instance now so its output listener is attached before the shell prints.
    getOrCreateTerminal(id)
    addTab(path, { id, title: `zsh ${count + 1}`, cwd: path })
  }, [path, addTab])

  const closeSession = useCallback(
    (id: string) => {
      if (!path) return
      disposeTerminal(id)
      removeTab(path, id)
    },
    [path, removeTab]
  )

  const openTerminal = useCallback(async () => {
    if (!path) return
    openPanel()
    if (useTerminalStore.getState().tabsFor(path).tabs.length === 0) {
      await addSession()
    }
  }, [path, openPanel, addSession])

  const toggle = useCallback(async () => {
    if (useTerminalStore.getState().open) {
      closePanel()
    } else {
      await openTerminal()
    }
  }, [closePanel, openTerminal])

  return { open, addSession, closeSession, openTerminal, toggle }
}
