import { ChevronUp, Terminal as TerminalIcon } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { useTerminalStore } from '../../stores/terminal.store'

interface TerminalStatusBarProps {
  /** The active repo/worktree path whose collapsed sessions this bar summarises. */
  path: string
}

/**
 * Thin bar shown at the bottom of the repo view when the terminal panel is collapsed but sessions
 * still exist for the current path. Clicking it re-opens the panel. Renders nothing when there are
 * no sessions to restore (the toolbar's terminal button is then the way to spawn one).
 */
export function TerminalStatusBar({ path }: TerminalStatusBarProps) {
  const { t } = useTranslation('git')
  const repoTerminals = useTerminalStore((s) => s.byPath[path])
  const openPanel = useTerminalStore((s) => s.openPanel)
  const count = repoTerminals?.tabs.length ?? 0

  if (count === 0) return null

  return (
    <button
      type="button"
      onClick={openPanel}
      title={t('terminal.restore')}
      data-testid="terminal-status-bar"
      className="chrome-surface flex h-7 shrink-0 items-center gap-2 border-t border-border bg-sidebar px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <TerminalIcon className="h-3.5 w-3.5 text-emerald-400" />
      <span>{t('terminal.title')}</span>
      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-none">
        {count}
      </span>
      <ChevronUp className="ml-auto h-3.5 w-3.5" />
    </button>
  )
}
