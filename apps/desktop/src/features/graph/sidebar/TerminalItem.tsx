import { X } from 'lucide-react'
import { Tooltip, cn } from '@git-manager/ui'
import { highlightMatch } from '@git-manager/components'
import { useTranslation } from '@git-manager/i18n'
import type { TerminalSession } from '../../../stores/terminal.store'
import type { TerminalSessionState } from '../../../lib/terminalState'
import { TerminalStateIcon } from '../../../components/terminal/TerminalStateIcon'
import { HoverExpandLabel } from './HoverExpandLabel'

interface TerminalItemProps {
  session: TerminalSession
  /** Branch checked out where the session lives, or its folder name. */
  location: string
  /** True when the panel is currently showing this session. */
  isActive: boolean
  /** Running / finished-unseen / quiet — see {@link TerminalSessionState}. */
  state: TerminalSessionState
  /** The name of the command that state is about, when the backend could resolve it. */
  command: string | null
  filterQuery?: string
  /** Enters the session's worktree, opens the panel and shows it. */
  onFocus?: (session: TerminalSession) => void
  onClose?: (id: string) => void
}

/**
 * One live shell session in the sidebar.
 *
 * The row leads with the worktree rather than the session's own name because that is what a click
 * does: it takes the view to that worktree and puts the terminal on screen. The running command
 * takes the second line — "claude" beside "feat/login" is the whole point of the list, and it is
 * also the only thing here that changes on its own.
 */
export function TerminalItem({
  session,
  location,
  isActive,
  state,
  command,
  filterQuery = '',
  onFocus,
  onClose,
}: TerminalItemProps) {
  const { t } = useTranslation('git')
  // Only reached when the command could not be named — rare, and still better than a blank slot.
  const trailingFallback =
    state === 'busy' ? t('terminal.runningSomething') : t('terminal.finished')

  return (
    <Tooltip
      placement="bottom"
      delay={400}
      className="max-w-none px-3 py-2"
      content={
        <div className="max-w-xs whitespace-normal">
          <div className="text-[10px] tracking-wide text-muted-foreground uppercase">
            {t('sidebar.worktree.workingDirectory')}
          </div>
          <div className="mt-0.5 font-mono text-[11px] break-all text-foreground">
            {session.cwd}
          </div>
        </div>
      }
    >
      <div
        data-testid={`terminal-item-${session.id}`}
        className={cn(
          'group/term relative flex items-center gap-1.5 py-[3px] pr-6 pl-6 text-xs transition-colors',
          isActive
            ? 'bg-sidebar-accent/70 text-sidebar-foreground'
            : 'text-sidebar-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
        )}
      >
        <button
          type="button"
          onClick={() => onFocus?.(session)}
          aria-label={t('sidebar.terminal.show')}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
          data-testid={`terminal-item-open-${session.id}`}
        >
          <TerminalStateIcon state={state} data-testid={`terminal-item-state-${session.id}`} />
          <HoverExpandLabel className="min-w-0 flex-1 truncate font-medium">
            {highlightMatch(location, filterQuery)}
          </HoverExpandLabel>
          {/* The trailing slot says what the row is *about*: the command while there is news
              about one, and the session's own name the rest of the time — which is the only thing
              that tells two shells on the same worktree apart. */}
          <span
            className={cn(
              'shrink-0 truncate font-mono text-[10px]',
              state === 'done' ? 'text-tone-info' : 'text-sidebar-muted-foreground/50'
            )}
          >
            {state === 'idle' ? session.title : (command ?? trailingFallback)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onClose?.(session.id)}
          aria-label={t('sidebar.terminal.close')}
          title={t('sidebar.terminal.close')}
          data-testid={`terminal-item-close-${session.id}`}
          className="absolute top-1/2 right-1 shrink-0 -translate-y-1/2 cursor-pointer rounded p-0.5 text-sidebar-muted-foreground opacity-0 transition-all group-hover/term:opacity-100 hover:bg-sidebar-accent/80 hover:text-sidebar-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </Tooltip>
  )
}
