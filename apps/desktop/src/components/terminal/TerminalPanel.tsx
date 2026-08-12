import { useRef } from 'react'
import { ChevronDown, Plus, X } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { Button } from '@git-manager/ui'
import { useTerminalStore } from '../../stores/terminal.store'
import { useIntegratedTerminal } from '../../hooks/useIntegratedTerminal'
import { useTerminalActivity } from '../../hooks/useTerminalActivity'
import { useWorktrees } from '../../hooks/useWorktrees'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { terminalLocationLabel } from '../../lib/terminalLocation'
import { TerminalTab } from './TerminalTab'
import { XtermView } from './XtermView'

interface TerminalPanelProps {
  /** The repo/worktree path on screen — where the "+" button spawns its shell. */
  path: string
}

/**
 * Bottom-docked integrated terminal: a resizable panel with a tab strip of PTY-backed zsh sessions
 * and the active session's xterm.js viewport. Only the active tab is mounted; inactive sessions keep
 * running in the registry (their scrollback survives tab switches and panel toggles).
 *
 * The strip lists **every** live session, not the ones belonging to the path on screen: a session is
 * bound to the directory it was spawned in and outlives any view change (see `terminal.store.ts`),
 * so each tab names its worktree. `path` is used for one thing only — the directory a *new* session
 * binds to.
 */
export function TerminalPanel({ path }: TerminalPanelProps) {
  const { t } = useTranslation('git')
  const height = useTerminalStore((s) => s.height)
  const setHeight = useTerminalStore((s) => s.setHeight)
  const closePanel = useTerminalStore((s) => s.closePanel)
  const setActiveSession = useTerminalStore((s) => s.setActiveSession)
  const sessions = useTerminalStore((s) => s.sessions)
  const activeId = useTerminalStore((s) => s.activeId)
  const { addSession, closeSession, closeAllSessions } = useIntegratedTerminal(path)
  const activity = useTerminalActivity()
  const activeRepo = useRepoUIStore((s) => s.activeRepo)
  const worktrees = useWorktrees(activeRepo)

  const drag = useRef<{ startY: number; startHeight: number } | null>(null)

  const onHandleDown = (e: React.PointerEvent) => {
    drag.current = { startY: e.clientY, startHeight: height }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onHandleMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    // Dragging up (smaller clientY) grows the panel.
    setHeight(drag.current.startHeight + (drag.current.startY - e.clientY))
  }
  const onHandleUp = (e: React.PointerEvent) => {
    drag.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  return (
    <div
      style={{ height }}
      className="chrome-surface flex shrink-0 flex-col border-t border-border bg-card"
      data-testid="terminal-panel"
    >
      {/* Resize handle */}
      <div
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        className="h-1 shrink-0 cursor-row-resize bg-transparent transition-colors hover:bg-primary/40"
        data-testid="terminal-resize-handle"
        role="separator"
        aria-orientation="horizontal"
      />

      {/* Tab strip */}
      <div className="flex h-8 shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2">
        {sessions.map((session) => (
          <TerminalTab
            key={session.id}
            session={session}
            isActive={session.id === activeId}
            isBusy={activity[session.id]?.busy}
            command={activity[session.id]?.command}
            location={terminalLocationLabel(session.cwd, worktrees)}
            onSelect={() => setActiveSession(session.id)}
            onClose={() => closeSession(session.id)}
          />
        ))}
        <Button
          variant="ghost"
          size="iconSm"
          onClick={() => void addSession()}
          aria-label={t('terminal.newTab')}
          title={t('terminal.newTab')}
          data-testid="terminal-new-tab"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="iconSm"
            onClick={closePanel}
            aria-label={t('terminal.hidePanel')}
            title={t('terminal.hidePanel')}
            data-testid="terminal-hide"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="iconSm"
            onClick={closeAllSessions}
            aria-label={t('terminal.closePanel')}
            title={t('terminal.closePanel')}
            data-testid="terminal-close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Active session viewport */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-card p-1">
        {activeId ? (
          <XtermView key={activeId} id={activeId} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {t('terminal.newTab')}
          </div>
        )}
      </div>
    </div>
  )
}
