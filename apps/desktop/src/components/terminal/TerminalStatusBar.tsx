import { ChevronUp } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { Tooltip } from '@git-manager/ui'
import { useTerminalStore } from '../../stores/terminal.store'
import { useTerminalActivity } from '../../hooks/useTerminalActivity'
import { terminalSessionState } from '../../lib/terminalState'
import { TerminalStateIcon } from './TerminalStateIcon'

/**
 * Thin bar shown at the bottom of the repo view when the terminal panel is collapsed but sessions
 * are still alive. Clicking it re-opens the panel. Renders nothing when there is no session to
 * restore (the toolbar's terminal button is then the way to spawn one).
 *
 * It counts every session rather than the ones belonging to the view on screen: a shell keeps
 * running in the worktree it was opened in whatever the user is looking at, and a bar that dropped
 * to zero on entering another workspace would say the opposite. When something is running, it says
 * so — a collapsed panel is exactly when that fact is easiest to lose.
 */
export function TerminalStatusBar() {
  const { t } = useTranslation('git')
  const count = useTerminalStore((s) => s.sessions.length)
  const openPanel = useTerminalStore((s) => s.openPanel)
  const activity = useTerminalActivity()
  const finished = useTerminalStore((s) => s.finished)
  const busyCount = Object.values(activity).filter((status) => status.busy).length
  const finishedCount = Object.keys(finished).length

  if (count === 0) return null

  return (
    <Tooltip content={t('terminal.restore')}>
      <button
        type="button"
        onClick={openPanel}
        aria-label={t('terminal.restore')}
        data-testid="terminal-status-bar"
        className="chrome-surface flex h-7 shrink-0 items-center gap-2 border-t border-border bg-sidebar px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <TerminalStateIcon
          state={terminalSessionState(busyCount > 0, finishedCount > 0)}
          size={3.5}
          data-testid="terminal-status-state"
        />
        <span>{t('terminal.title')}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-none">
          {count}
        </span>
        {busyCount > 0 ? (
          <span className="text-muted-foreground" data-testid="terminal-status-busy">
            {t('terminal.runningCount', { count: busyCount })}
          </span>
        ) : (
          finishedCount > 0 && (
            <span className="text-tone-info" data-testid="terminal-status-finished">
              {t('terminal.finishedCount', { count: finishedCount })}
            </span>
          )
        )}
        <ChevronUp className="ml-auto h-3.5 w-3.5" />
      </button>
    </Tooltip>
  )
}
