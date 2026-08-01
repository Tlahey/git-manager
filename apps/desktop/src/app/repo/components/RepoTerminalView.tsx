import { useEffect, useRef } from 'react'
import { TerminalPanel } from '../../../components/terminal/TerminalPanel'
import { useIntegratedTerminal } from '../../../hooks/useIntegratedTerminal'
import { useTerminalStore } from '../../../stores/terminal.store'

interface RepoTerminalViewProps {
  /** Repo (or linked worktree) path whose shells this view shows. */
  path: string
}

/**
 * The repo tab's Terminal view: the existing integrated terminal, full height, instead of docked
 * under the graph. Nothing is duplicated — same store, same PTY sessions — so a shell started in the
 * dock is the shell shown here, and switching views only re-attaches its xterm node.
 */
export function RepoTerminalView({ path }: RepoTerminalViewProps) {
  const { addSession } = useIntegratedTerminal(path)
  const spawnedFor = useRef<string | null>(null)

  // Opening the view on a path with no shell yet spawns one: a Terminal tab that shows an empty
  // rectangle until you find the "+" is a dead end. Guarded per path so re-renders don't respawn —
  // and so closing every session on purpose leaves the view empty rather than fighting the user.
  useEffect(() => {
    if (spawnedFor.current === path) return
    spawnedFor.current = path
    if (useTerminalStore.getState().tabsFor(path).tabs.length === 0) {
      void addSession().catch(() => {
        /* spawning the shell failed (no PTY): the "+" button stays the way to retry */
      })
    }
  }, [path, addSession])

  return (
    <div
      id="repo-view-panel-terminal"
      role="tabpanel"
      aria-labelledby="repo-view-tab-terminal"
      data-testid="repo-terminal-view"
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <TerminalPanel path={path} variant="view" />
    </div>
  )
}
