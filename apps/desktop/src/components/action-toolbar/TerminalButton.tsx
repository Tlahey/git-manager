import { ChevronDown, ExternalLink, Star, Terminal as TerminalIcon } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@git-manager/ui'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useSettingsStore } from '../../stores/settings.store'
import { useIntegratedTerminal } from '../../hooks/useIntegratedTerminal'
import { apiOpenTerminal } from '../../api/shell.api'

/** Turns a terminal app path (e.g. `/Applications/iTerm.app`) into a readable label (`iTerm`). */
function appLabel(command: string): string {
  const base = command.split('/').pop() ?? command
  return base.replace(/\.app$/i, '')
}

/**
 * Split button for the toolbar: the primary click toggles the *integrated* terminal panel at the
 * active repo/worktree path; the chevron opens a menu to launch the same location in an *external*
 * terminal — the user's configured preferred one (Settings → External tools) and/or the system
 * default. Mirrors `RunButton`'s shape.
 */
export function TerminalButton() {
  const { t } = useTranslation('git')
  const activeRepo = useRepoUIStore((s) => s.activeRepo)
  const activeWorkspacePath = useRepoUIStore((s) => s.activeWorkspacePath)
  const path = activeWorkspacePath ?? activeRepo
  const preferred = useSettingsStore((s) => s.settings.externalTools?.externalTerminalCommand) || ''

  const { toggle } = useIntegratedTerminal(path)

  const openExternal = (command: string) => {
    if (!path) return
    void apiOpenTerminal(path, command)
  }

  return (
    <div className="flex shrink-0 items-stretch" data-testid="toolbar-terminal-button">
      <button
        type="button"
        onClick={() => void toggle()}
        title={t('terminal.open')}
        disabled={!path}
        data-testid="toolbar-terminal-button-primary"
        className="group flex min-w-[40px] flex-col items-center justify-center gap-0.5 rounded-l px-2 py-1 transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
      >
        <TerminalIcon className="h-4 w-4 text-emerald-400" />
        <span className="hidden text-[10px] leading-none text-muted-foreground transition-colors group-hover:text-foreground lg:inline">
          {t('terminal.title')}
        </span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t('terminal.externalHeader')}
            data-testid="toolbar-terminal-button-menu"
            className="flex items-center rounded-r px-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {t('terminal.externalHeader')}
          </div>
          {preferred && (
            <>
              <DropdownMenuItem
                onSelect={() => openExternal(preferred)}
                disabled={!path}
                data-testid="toolbar-terminal-external-preferred"
                className="flex items-center gap-2 text-xs"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <span className="truncate">{appLabel(preferred)}</span>
                <Star className="ml-auto h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem
            onSelect={() => openExternal('')}
            disabled={!path}
            data-testid="toolbar-terminal-external-default"
            className="flex items-center gap-2 text-xs"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{t('terminal.systemDefault')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
