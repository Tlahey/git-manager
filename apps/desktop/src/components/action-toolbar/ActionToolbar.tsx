import {
  ArrowUpFromLine,
  ChevronRight,
  Command as CommandIcon,
  GitPullRequest,
  Redo2,
  Search,
  Code as CodeIcon,
  Undo2,
  History,
  Archive,
  ArchiveRestore,
  FolderOpen,
} from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { useActionToolbar } from '../../hooks/useActionToolbar'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useTimelineNavStore } from '../../stores/timelineNav.store'
import { useUndoHistoryStore } from '../../stores/undoHistory.store'
import { useIsCommitsView } from '../../hooks/useIsCommitsView'
import { useRunTasks } from '../../hooks/useRunTasks'
import { useCommandPaletteStore } from '../../stores/commandPalette.store'
import { useCommitSearchStore } from '../../stores/commitSearch.store'
import { useFileExplorerStore } from '../../stores/fileExplorer.store'
import { useAiEnabled } from '../../hooks/useAiEnabled'
import { RepoSelector } from './RepoSelector'
import { BranchContext } from './BranchContext'
import { MergeTargetIndicator } from './MergeTargetIndicator'
import { StateTags } from './StateTags'
import { FetchButton } from './FetchButton'
import { BranchButton } from './BranchButton'
import { RunButton } from './RunButton'
import { TerminalButton } from './TerminalButton'
import { ToolsMenu } from './ToolsMenu'
import { AiMenu } from './AiMenu'
import { ToolbarButton } from '@git-manager/components'
import type { Section, Scope } from '../../app/settings/SettingsPage'

interface ActionToolbarProps {
  /** Opens Settings on a given page/scope. Used by the merge-target indicator to link to this
   * repo's GitFlow settings; omitted (e.g. in tests) hides that shortcut. */
  onOpenSettings?: (section?: Section, scope?: Scope) => void
}

/** Main action bar, sitting under the tabs. */
export function ActionToolbar({ onOpenSettings }: ActionToolbarProps = {}) {
  const { t } = useTranslation('git')

  const {
    activeRepo,
    fromRef,
    loading,
    hasChanges,
    hasStashes,
    aheadCount,
    behindCount,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    hasEditor,
    handleOpenEditor,
    handleFetch,
    handleFetchAll,
    handlePull,
    handlePush,
    handleUndo,
    handleRedo,
    handleStash,
    handlePop,
    handleCreateBranch,
  } = useActionToolbar(t)

  // A viewed workspace (linked worktree) has its own HEAD, so branch-scoped indicators read from
  // its path rather than the repo tab's — same rule as the rest of the workspace-aware views.
  const activeWorkspacePath = useRepoUIStore((s) => s.activeWorkspacePath)
  const effectiveRepoPath = activeWorkspacePath ?? activeRepo

  const aiEnabled = useAiEnabled()
  const isCommitsView = useIsCommitsView()
  const { tasks, defaultTask, hasTasks, runTask } = useRunTasks()
  const disabled = !activeRepo

  const openTimeline = () => {
    if (!activeRepo) return
    const pointer = useUndoHistoryStore.getState().byRepo[activeRepo]?.pointer ?? 0
    useTimelineNavStore.getState().open(activeRepo, pointer)
  }

  const isFileExplorerOpen = useFileExplorerStore((s) => s.isOpen)
  const toggleFileExplorer = useFileExplorerStore((s) => s.actions.toggleOpen)

  return (
    <div className="chrome-surface flex h-[52px] shrink-0 items-center gap-1 overflow-hidden border-b border-border bg-sidebar px-2">
      {/* ── Left section: context ─────────────────────────────── */}
      <div className="flex min-w-0 shrink items-center gap-1">
        <RepoSelector />
        <ChevronRight className="h-4 w-4 shrink-0 self-end pb-0.5 text-muted-foreground/40" />
        <BranchContext />
        <div className="ml-1 flex items-center gap-1 self-end pb-0.5">
          {/* Merge-target state of the current branch, then the linked PR — both read-only tags on
              the branch shown to their left. */}
          <MergeTargetIndicator
            repoPath={effectiveRepoPath}
            onOpenSettings={
              onOpenSettings ? () => onOpenSettings('general', 'local') : undefined
            }
          />
          <StateTags />
        </div>
      </div>

      <div className="mx-1 hidden h-6 w-px shrink-0 bg-border sm:block" />

      {/* ── Middle section: quick actions ─────────────────────── */}
      {/* `py-1.5` gives the buttons' overflowing count badges vertical headroom: `overflow-x-auto`
          also clips the y-axis, so without padding a badge poking above its icon gets cropped. */}
      <div className="flex min-w-0 shrink items-center gap-0.5 overflow-x-auto py-1.5">
        <ToolbarButton
          icon={<Undo2 className="h-4 w-4 text-muted-foreground" />}
          label={t('toolbar.undo')}
          title={undoLabel ? t(undoLabel.key, undoLabel.params) : t('toolbar.undo')}
          loading={loading.undo}
          disabled={disabled || !canUndo}
          onClick={handleUndo}
          data-testid="toolbar-undo-button"
        />
        <ToolbarButton
          icon={<Redo2 className="h-4 w-4 text-muted-foreground" />}
          label={t('toolbar.redo')}
          title={redoLabel ? t(redoLabel.key, redoLabel.params) : t('toolbar.redo')}
          loading={loading.redo}
          disabled={disabled || !canRedo}
          onClick={handleRedo}
          data-testid="toolbar-redo-button"
        />
        <ToolbarButton
          icon={<History className="h-4 w-4 text-muted-foreground" />}
          label={t('timeline.open')}
          title={t('timeline.openTitle')}
          disabled={disabled || !(canUndo || canRedo)}
          onClick={openTimeline}
          data-testid="toolbar-timeline-button"
        />

        <div className="mx-1 h-6 w-px shrink-0 bg-border" />

        <FetchButton
          loading={loading.fetch}
          onFetch={handleFetch}
          onFetchAll={handleFetchAll}
          onFetchPrune={handleFetch}
        />
        <ToolbarButton
          icon={<GitPullRequest className="h-4 w-4 text-blue-400" />}
          label={t('remote.pull')}
          title={
            behindCount > 0
              ? t('remote.commitsToPull', { count: behindCount })
              : t('remote.pull')
          }
          loading={loading.pull}
          disabled={disabled}
          badge={behindCount}
          onClick={handlePull}
        />
        <ToolbarButton
          icon={<ArrowUpFromLine className="h-4 w-4 text-green-400" />}
          label={t('remote.push')}
          title={
            aheadCount > 0
              ? t('remote.commitsToPush', { count: aheadCount })
              : t('remote.push')
          }
          loading={loading.push}
          disabled={disabled}
          badge={aheadCount}
          onClick={handlePush}
        />

        <div className="mx-1 h-6 w-px shrink-0 bg-border" />

        <BranchButton fromRef={fromRef} onCreate={handleCreateBranch} />
        <ToolbarButton
          icon={<Archive className="h-4 w-4 text-violet-400" />}
          label={t('toolbar.stash')}
          loading={loading.stash}
          disabled={disabled || !hasChanges}
          onClick={handleStash}
          data-testid="toolbar-stash-button"
        />
        <ToolbarButton
          icon={<ArchiveRestore className="h-4 w-4 text-violet-400" />}
          label={t('toolbar.pop')}
          loading={loading.pop}
          disabled={disabled || !hasStashes}
          onClick={handlePop}
        />

        <div className="mx-1 h-6 w-px shrink-0 bg-border" />

        <ToolsMenu repoPath={activeRepo} />

        {/* The model's own zone, kept apart from Tools: bisect and patches are deterministic, these
            spend a model run. `AiMenu` renders nothing when the provider is off, and the divider
            goes with it rather than leaving a stray separator behind. */}
        {aiEnabled && (
          <>
            <div className="mx-1 h-6 w-px shrink-0 bg-border" />
            <AiMenu repoPath={activeRepo} />
          </>
        )}

        {hasTasks && (
          <>
            <div className="mx-1 h-6 w-px shrink-0 bg-border" />
            <RunButton tasks={tasks} defaultTask={defaultTask} onRun={runTask} />
          </>
        )}

        <div className="mx-1 h-6 w-px shrink-0 bg-border" />

        <TerminalButton />

        {hasEditor && (
          <ToolbarButton
            icon={<CodeIcon className="h-4 w-4 text-sky-400" />}
            label={t('toolbar.editor')}
            title={t('toolbar.editorTitle')}
            disabled={!activeRepo}
            onClick={handleOpenEditor}
            data-testid="toolbar-editor-button"
          />
        )}
      </div>

      {/* ── Right section: actions & search ───────────────────── */}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <ToolbarButton
          icon={<FolderOpen className={`h-4 w-4 ${isFileExplorerOpen ? 'text-primary' : 'text-muted-foreground'}`} />}
          label={isFileExplorerOpen ? t('toolbar.filesClose') : t('toolbar.files')}
          title={t('toolbar.filesTitle')}
          disabled={disabled}
          onClick={() => toggleFileExplorer()}
          data-testid="toolbar-files-button"
        />
        <ToolbarButton
          icon={<CommandIcon className="h-4 w-4 text-muted-foreground" />}
          label={t('toolbar.actions')}
          title={`${t('toolbar.actions')} (⌘K)`}
          onClick={() => useCommandPaletteStore.getState().toggle('all')}
          data-testid="toolbar-actions-button"
        />
        <ToolbarButton
          icon={<Search className="h-4 w-4 text-muted-foreground" />}
          label={t('toolbar.searchLabel')}
          title={`${t('toolbar.search')} (⌘F)`}
          disabled={disabled || !isCommitsView}
          onClick={() => useCommitSearchStore.getState().toggle()}
          data-testid="toolbar-search-button"
        />
      </div>
    </div>
  )
}
