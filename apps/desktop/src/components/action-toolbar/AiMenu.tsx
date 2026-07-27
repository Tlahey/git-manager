import { ChevronDown, CalendarClock } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  LlmIcon,
} from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { useRepoUIStore, type AiPanelTarget } from '../../stores/repoUI.store'
import { useSettingsStore } from '../../stores/settings.store'
import { useAiEnabled } from '../../hooks/useAiEnabled'

interface AiMenuProps {
  repoPath: string | null
}

/**
 * The toolbar's LLM zone.
 *
 * Deliberately narrow: it holds only actions that make sense with **nothing selected**, because a
 * toolbar menu is opened without a selection. Explaining a commit, reviewing a branch, explaining the
 * working tree — all of those need the user to have picked something first, so they stay on the row
 * that carries it. Listing them here would mean a menu that is mostly greyed out, which teaches the
 * user to stop opening it.
 *
 * That leaves the daily briefings, which need only the repository. If a second such action appears,
 * this is where it goes.
 *
 * The entry opens into the graph's single right-hand slot through `aiPanelTarget`, which is what
 * guarantees it and an AI explanation can never claim that slot at once.
 */
export function AiMenu({ repoPath }: AiMenuProps) {
  const { t } = useTranslation('git')
  const aiEnabled = useAiEnabled()
  const summariesEnabled = useSettingsStore((s) => s.settings.dailySummary?.enabled ?? true)
  const disabled = !repoPath

  // The centre slot's other claimants are cleared first, or the panel opens behind a diff the user
  // then has to close by hand — the same handoff `openPatchMode` performs.
  function openPanel(target: AiPanelTarget) {
    const ui = useRepoUIStore.getState()
    ui.setActiveDiffFile(null)
    ui.setActivePrNumber(null)
    ui.setAiPanelTarget(target)
  }

  // Hidden rather than disabled when there would be nothing in it: an empty or fully greyed-out menu
  // is worse than no menu, and Settings already explains that AI is switched off.
  if (!aiEnabled || !summariesEnabled) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={t('ai.menu')}
          data-testid="toolbar-ai-button"
          className="group relative flex min-w-[40px] shrink-0 flex-col items-center justify-center gap-0.5 rounded px-2 py-1 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="flex h-4 w-4 items-center justify-center">
            <LlmIcon className="h-4 w-4 text-primary" />
          </span>
          <span className="hidden items-center gap-0.5 text-[10px] leading-none text-muted-foreground transition-colors group-hover:text-foreground lg:flex">
            {t('ai.menu')}
            <ChevronDown className="h-3 w-3" />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem
          onSelect={() => openPanel({ kind: 'summaries' })}
          className="gap-2 text-xs"
          data-testid="ai-menu-summaries"
        >
          <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
          {t('dashboard:summaries.menuItem')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
