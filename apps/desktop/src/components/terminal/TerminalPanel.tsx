import { useRef } from 'react'
import { ChevronDown, Plus, Terminal as TerminalIcon, X } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { cn } from '@git-manager/ui'
import { useTerminalStore } from '../../stores/terminal.store'
import { useIntegratedTerminal } from '../../hooks/useIntegratedTerminal'
import { XtermView } from './XtermView'

interface TerminalPanelProps {
  /** The active repo/worktree path whose sessions this panel shows. */
  path: string
}

/**
 * Bottom-docked integrated terminal: a resizable panel with a tab strip of PTY-backed zsh sessions
 * and the active session's xterm.js viewport. Only the active tab is mounted; inactive sessions keep
 * running in the registry (their scrollback survives tab switches and panel toggles).
 */
export function TerminalPanel({ path }: TerminalPanelProps) {
  const { t } = useTranslation('git')
  const height = useTerminalStore((s) => s.height)
  const setHeight = useTerminalStore((s) => s.setHeight)
  const closePanel = useTerminalStore((s) => s.closePanel)
  const setActiveTab = useTerminalStore((s) => s.setActiveTab)
  const repoTerminals = useTerminalStore((s) => s.byPath[path])
  const tabs = repoTerminals?.tabs ?? []
  const activeId = repoTerminals?.activeId ?? null
  const { addSession, closeSession } = useIntegratedTerminal(path)

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
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border px-2">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              'group flex items-center gap-1.5 rounded px-2 py-0.5 text-xs',
              tab.id === activeId
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50'
            )}
          >
            <button
              type="button"
              onClick={() => setActiveTab(path, tab.id)}
              className="flex items-center gap-1.5"
              data-testid={`terminal-tab-${tab.id}`}
            >
              <TerminalIcon className="h-3 w-3 text-emerald-400" />
              <span className="font-mono">{tab.title}</span>
            </button>
            <button
              type="button"
              onClick={() => closeSession(tab.id)}
              aria-label={t('terminal.closeTab')}
              title={t('terminal.closeTab')}
              data-testid={`terminal-close-tab-${tab.id}`}
              className="rounded p-0.5 opacity-0 transition-opacity hover:bg-background group-hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => void addSession()}
          aria-label={t('terminal.newTab')}
          title={t('terminal.newTab')}
          data-testid="terminal-new-tab"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={closePanel}
          aria-label={t('terminal.hidePanel')}
          title={t('terminal.hidePanel')}
          data-testid="terminal-hide"
          className="ml-auto rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
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
