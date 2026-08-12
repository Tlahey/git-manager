import { useCallback } from 'react'
import { useRepoUIStore } from '../stores/repoUI.store'
import { useTerminalStore } from '../stores/terminal.store'

/**
 * Jumping to a terminal from the sidebar: put the view on the worktree that terminal is bound to,
 * show the panel, and make that session the one on screen (mounting it focuses its xterm).
 *
 * This is the one gesture that moves the view *because of* a terminal, and it is deliberately the
 * only one — the panel's own tab strip switches the session and leaves the view alone. The
 * difference is what each list is for: the tab strip answers "which shell am I typing into", the
 * sidebar answers "where is the work happening", and the second question is about the worktree.
 *
 * Entering the repo tab's own path clears the workspace instead of setting it to that path: a
 * workspace means "viewing a linked worktree in place of the tab", and the tab's own directory is
 * not one (see `repoUI.store.ts`).
 */
export function useFocusTerminalSession(): (sessionId: string, cwd: string) => void {
  const activeRepo = useRepoUIStore((s) => s.activeRepo)
  const setActiveWorkspacePath = useRepoUIStore((s) => s.setActiveWorkspacePath)
  const setActiveSession = useTerminalStore((s) => s.setActiveSession)
  const openPanel = useTerminalStore((s) => s.openPanel)

  return useCallback(
    (sessionId: string, cwd: string) => {
      setActiveWorkspacePath(cwd === activeRepo ? null : cwd)
      setActiveSession(sessionId)
      openPanel()
    },
    [activeRepo, setActiveWorkspacePath, setActiveSession, openPanel]
  )
}
