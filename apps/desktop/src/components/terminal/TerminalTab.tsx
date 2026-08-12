import { X } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { Tooltip, cn } from '@git-manager/ui'
import type { TerminalSession } from '../../stores/terminal.store'
import { TerminalStateIcon } from './TerminalStateIcon'

interface TerminalTabProps {
  session: TerminalSession
  isActive: boolean
  /** A command is holding the PTY's foreground — see `useTerminalActivity`. */
  isBusy?: boolean
  /** Name of that command (`claude`, `pnpm`), when the backend could resolve it. */
  command?: string | null
  /** Branch checked out where the session lives, or its folder name — see `terminalLocation.ts`. */
  location: string
  onSelect: () => void
  onClose: () => void
}

/**
 * One session in the panel's tab strip.
 *
 * The tab leads with *where* the shell is rather than what it is called, because the strip now spans
 * every worktree at once: "zsh 2" says nothing about which working copy a keystroke would land in,
 * and that is the only thing worth knowing before typing into it. The name stays beside it, which
 * is what tells two shells on the same worktree apart.
 */
export function TerminalTab({
  session,
  isActive,
  isBusy = false,
  command,
  location,
  onSelect,
  onClose,
}: TerminalTabProps) {
  const { t } = useTranslation('git')

  return (
    <Tooltip
      placement="top"
      delay={400}
      className="max-w-none px-3 py-2"
      content={
        <div className="max-w-xs whitespace-normal">
          <div className="font-mono text-[11px] break-all text-foreground">{session.cwd}</div>
          {isBusy && (
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              {command ? t('terminal.runningCommand', { command }) : t('terminal.runningSomething')}
            </div>
          )}
        </div>
      }
    >
      <div
        className={cn(
          'group flex max-w-[220px] items-center gap-1.5 rounded px-2 py-0.5 text-xs',
          isActive ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'
        )}
      >
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 cursor-pointer items-center gap-1.5"
          data-testid={`terminal-tab-${session.id}`}
        >
          <TerminalStateIcon busy={isBusy} data-testid={`terminal-state-${session.id}`} />
          <span className="truncate font-medium">{location}</span>
          <span className="shrink-0 font-mono text-[10px] opacity-50">{session.title}</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('terminal.closeTab')}
          title={t('terminal.closeTab')}
          data-testid={`terminal-close-tab-${session.id}`}
          className="shrink-0 cursor-pointer rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-background"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </Tooltip>
  )
}
