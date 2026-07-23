import { ChevronDown, FileDiff, FileDown, FileUp, Package, Bug, Wrench } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { usePatchWorkspaceStore, type PatchMode } from '../../stores/patchWorkspace.store'
import { useBisectUIStore } from '../../stores/bisectUI.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useBisectState } from '../../hooks/useBisectState'
import { useGitStatus } from '../../hooks/useGitStatus'

interface ToolsMenuProps {
  repoPath: string | null
}

/**
 * Toolbar "Tools" dropdown. Groups the patch actions (each opening the in-layout patch workspace)
 * under a Patch submenu, plus the bisect entry point which opens the start dialog. Replaces the
 * former standalone Patch menu.
 */
export function ToolsMenu({ repoPath }: ToolsMenuProps) {
  const { t } = useTranslation('git')
  const openPatch = usePatchWorkspaceStore((s) => s.open)
  const beginBisectSetup = useBisectUIStore((s) => s.beginSetup)
  const openBisectStashDialog = useBisectUIStore((s) => s.openStashDialog)
  const bisectSettingUp = useBisectUIStore((s) => s.setupActive)
  const { data: bisect } = useBisectState(repoPath)
  const { data: status } = useGitStatus(repoPath ?? '')
  const disabled = !repoPath
  const bisectActive = bisect?.active ?? false
  const bisectBusy = bisectActive || bisectSettingUp

  // Tracked modifications block bisect's checkouts; untracked-only files generally don't.
  const isDirty =
    (status?.staged.length ?? 0) +
      (status?.unstaged.length ?? 0) +
      (status?.conflicted.length ?? 0) >
    0

  // git bisect needs a clean tree before the selection even begins: prompt to stash up front when
  // dirty, otherwise go straight to picking the bad/good commits in the graph.
  function startBisect() {
    if (isDirty) openBisectStashDialog()
    else beginBisectSetup()
  }

  function openPatchMode(mode: PatchMode) {
    // Hand the center/right slots to the patch workspace by clearing the other
    // views that claim them (diff / PR), then activating the mode.
    const ui = useRepoUIStore.getState()
    ui.setActiveDiffFile(null)
    ui.setActivePrNumber(null)
    openPatch(mode)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={t('tools.menu')}
          aria-label={t('tools.menu')}
          data-testid="toolbar-tools-button"
          className="group relative flex min-w-[40px] shrink-0 flex-col items-center justify-center gap-0.5 rounded px-2 py-1 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="flex h-4 w-4 items-center justify-center">
            <Wrench className="h-4 w-4 text-amber-400" />
          </span>
          <span className="hidden items-center gap-0.5 text-[10px] leading-none text-muted-foreground transition-colors group-hover:text-foreground lg:flex">
            {t('tools.menu')}
            <ChevronDown className="h-3 w-3" />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 text-xs" data-testid="tools-menu-patch">
            <FileDiff className="h-3.5 w-3.5 text-muted-foreground" />
            {t('patch.menu')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            <DropdownMenuItem
              onSelect={() => openPatchMode('create')}
              className="gap-2 text-xs"
              data-testid="patch-menu-create"
            >
              <FileDown className="h-3.5 w-3.5 text-muted-foreground" />
              {t('patch.create.menuItem')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => openPatchMode('apply')}
              className="gap-2 text-xs"
              data-testid="patch-menu-apply"
            >
              <FileUp className="h-3.5 w-3.5 text-muted-foreground" />
              {t('patch.apply.menuItem')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => openPatchMode('dependency')}
              className="gap-2 text-xs"
              data-testid="patch-menu-dependency"
            >
              <Package className="h-3.5 w-3.5 text-muted-foreground" />
              {t('patch.dependency.menuItem')}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={() => startBisect()}
          disabled={bisectBusy}
          className="gap-2 text-xs"
          data-testid="tools-menu-bisect"
        >
          <Bug className="h-3.5 w-3.5 text-muted-foreground" />
          {bisectActive ? t('bisect.start.alreadyRunning') : t('bisect.start.menuItem')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
