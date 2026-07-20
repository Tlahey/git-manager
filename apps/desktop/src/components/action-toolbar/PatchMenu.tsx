import { ChevronDown, FileDiff, FileDown, FileUp, Package } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { usePatchWorkspaceStore, type PatchMode } from '../../stores/patchWorkspace.store'
import { useRepoUIStore } from '../../stores/repoUI.store'

interface PatchMenuProps {
  repoPath: string | null
}

/**
 * Toolbar dropdown for the patch actions. Each item opens the in-layout patch
 * workspace (right-panel file list + center diff), not a modal — so patches are
 * reviewed with the same two-pane view as commits and PRs.
 */
export function PatchMenu({ repoPath }: PatchMenuProps) {
  const { t } = useTranslation('git')
  const openPatch = usePatchWorkspaceStore((s) => s.open)
  const disabled = !repoPath

  function open(mode: PatchMode) {
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
          title={t('patch.menu')}
          aria-label={t('patch.menu')}
          data-testid="toolbar-patch-button"
          className="group relative flex min-w-[40px] shrink-0 flex-col items-center justify-center gap-0.5 rounded px-2 py-1 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="flex h-4 w-4 items-center justify-center">
            <FileDiff className="h-4 w-4 text-amber-400" />
          </span>
          <span className="hidden items-center gap-0.5 text-[10px] leading-none text-muted-foreground transition-colors group-hover:text-foreground lg:flex">
            {t('patch.menu')}
            <ChevronDown className="h-3 w-3" />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuItem
          onSelect={() => open('create')}
          className="gap-2 text-xs"
          data-testid="patch-menu-create"
        >
          <FileDown className="h-3.5 w-3.5 text-muted-foreground" />
          {t('patch.create.menuItem')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => open('apply')}
          className="gap-2 text-xs"
          data-testid="patch-menu-apply"
        >
          <FileUp className="h-3.5 w-3.5 text-muted-foreground" />
          {t('patch.apply.menuItem')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => open('dependency')}
          className="gap-2 text-xs"
          data-testid="patch-menu-dependency"
        >
          <Package className="h-3.5 w-3.5 text-muted-foreground" />
          {t('patch.dependency.menuItem')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
