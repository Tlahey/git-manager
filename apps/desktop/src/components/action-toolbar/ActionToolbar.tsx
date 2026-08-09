import { ChevronRight, Command as CommandIcon } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { ToolbarButton } from '@git-manager/components'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useRepoViewStore } from '../../stores/repoView.store'
import { useCommandPaletteStore } from '../../stores/commandPalette.store'
import { BoardToolbar } from '../../features/board'
import { FilesToolbar } from '../../features/files'
import { RepoSelector } from './RepoSelector'
import { BranchContext } from './BranchContext'
import { MergeTargetIndicator } from './MergeTargetIndicator'
import { StateTags } from './StateTags'
import { GraphToolbarActions } from '../../features/graph'
import { RepoViewSwitcher } from './RepoViewSwitcher'
import type { Section, Scope } from '../../app/settings/SettingsPage'

interface ActionToolbarProps {
  /** Opens Settings on a given page/scope. Used by the merge-target indicator to link to this
   * repo's GitFlow settings; omitted (e.g. in tests) hides that shortcut. */
  onOpenSettings?: (section?: Section, scope?: Scope) => void
}

/**
 * Main action bar, sitting under the tabs.
 *
 * **Only three things are on it whatever you are looking at**: which repository and branch you are
 * on (left), and which view you want plus the command palette (right). Everything between is the active view's own — the graph's
 * fetch/push/stash/tools, the board's ticket and sprint actions, the files view's search — supplied
 * by that view rather than by this file.
 *
 * That is the whole point of the split: a toolbar listing every command in the app made most of them
 * wrong most of the time. Pushing while reading a Kanban is not a mistake the user should have to
 * avoid making; it should not be on screen. It also means adding a command to a view is a change in
 * that view's folder, with nothing to register here.
 */
export function ActionToolbar({ onOpenSettings }: ActionToolbarProps = {}) {
  const { t } = useTranslation('git')

  const activeRepo = useRepoUIStore((s) => s.activeRepo)
  // A viewed workspace (linked worktree) has its own HEAD, so branch-scoped indicators read from
  // its path rather than the repo tab's — same rule as the rest of the workspace-aware views.
  const activeWorkspacePath = useRepoUIStore((s) => s.activeWorkspacePath)
  const effectiveRepoPath = activeWorkspacePath ?? activeRepo
  const view = useRepoViewStore((s) => s.view)

  return (
    <div
      data-testid="action-toolbar"
      className="chrome-surface border-border bg-sidebar flex h-[52px] shrink-0 items-center gap-1 overflow-hidden border-b px-2"
    >
      {/* ── Left section: context ─────────────────────────────── */}
      <div className="flex min-w-0 shrink items-center gap-1">
        <RepoSelector />
        <ChevronRight className="text-muted-foreground/40 h-4 w-4 shrink-0 self-end pb-0.5" />
        <BranchContext />
        <div className="ml-1 flex items-center gap-1 self-end pb-0.5">
          {/* Merge-target state of the current branch, then the linked PR — both read-only tags on
              the branch shown to their left. */}
          <MergeTargetIndicator
            repoPath={effectiveRepoPath}
            onOpenSettings={onOpenSettings ? () => onOpenSettings('general', 'local') : undefined}
          />
          <StateTags />
        </div>
      </div>

      <div className="bg-border mx-1 hidden h-6 w-px shrink-0 sm:block" />

      {/* ── Middle section: the active view's own actions ──────── */}
      {/* `py-1.5` gives the buttons' overflowing count badges vertical headroom: `overflow-x-auto`
          also clips the y-axis, so without padding a badge poking above its icon gets cropped. */}
      <div
        className="flex min-w-0 shrink items-center gap-0.5 overflow-x-auto py-1.5"
        data-testid={`toolbar-view-actions-${view}`}
      >
        {view === 'graph' && <GraphToolbarActions />}
        {view === 'files' && <FilesToolbar />}
        {view === 'board' && effectiveRepoPath && <BoardToolbar repoPath={effectiveRepoPath} />}
      </div>

      {/* ── Right section: which view, and the one command that is every view's ── */}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <RepoViewSwitcher />
        <ToolbarButton
          icon={<CommandIcon className="text-muted-foreground h-4 w-4" />}
          label={t('toolbar.actions')}
          title={`${t('toolbar.actions')} (⌘K)`}
          onClick={() => useCommandPaletteStore.getState().toggle('all')}
          data-testid="toolbar-actions-button"
        />
      </div>
    </div>
  )
}
