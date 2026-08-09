import {
  GitPullRequest,
  Redo2,
  Search,
  Code as CodeIcon,
  Undo2,
  History,
  Archive,
  ArchiveRestore,
} from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { ToolbarButton } from '@git-manager/components'
import { useActionToolbar } from '../../hooks/useActionToolbar'
import { useTimelineNavStore } from '../../stores/timelineNav.store'
import { useUndoHistoryStore } from '../../stores/undoHistory.store'
import { useAiEnabled } from '../../hooks/useAiEnabled'
import { useIsCommitsView } from '../../hooks/useIsCommitsView'
import { useRunTasks } from '../../hooks/useRunTasks'
import { useCommitSearchStore } from '../../stores/commitSearch.store'
import { deriveTimeline } from '../../lib/timelineModel'
import { FetchButton } from './FetchButton'
import { PushButton } from './PushButton'
import { BranchButton } from './BranchButton'
import { RunButton } from './RunButton'
import { TerminalButton } from './TerminalButton'
import { ToolsMenu } from './ToolsMenu'
import { AiMenu } from './AiMenu'

/**
 * The graph view's section of the app toolbar: everything that acts on the repository's history.
 *
 * It is a *section*, not the toolbar — `ActionToolbar` draws the parts that are true of a repo tab
 * whatever you are looking at (which repo, which branch, ⌘K), and hands the middle to whichever view
 * is active. Fetching, pushing, stashing, the tools and the model all live here rather than there
 * because none of them is reachable — or meaningful — while the user is reading a Kanban board or
 * browsing files, and a toolbar that offers a command the current view cannot answer for is exactly
 * what this split exists to stop.
 *
 * Mounting it only on the graph view has a second effect worth stating: `useActionToolbar` and
 * `useRunTasks` are its hooks, so their queries stop running while the other two views are on
 * screen.
 */
export function GraphToolbarActions() {
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

  const aiEnabled = useAiEnabled()
  const isCommitsView = useIsCommitsView()
  const { tasks, defaultTask, hasTasks, runTask } = useRunTasks()
  const disabled = !activeRepo

  const openTimeline = () => {
    if (!activeRepo) return
    // The overlay is indexed by *gesture*, not by stack entry, so the starting step has to come
    // from the model rather than from the raw pointer (they differ as soon as one gesture recorded
    // several git operations — see `lib/undoGestures.ts`).
    const history = useUndoHistoryStore.getState().byRepo[activeRepo]
    const { currentIndex } = deriveTimeline(history?.stack ?? [], history?.pointer ?? 0)
    useTimelineNavStore.getState().open(activeRepo, currentIndex)
  }

  return (
    <>
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
        title={behindCount > 0 ? t('remote.commitsToPull', { count: behindCount }) : t('remote.pull')}
        loading={loading.pull}
        disabled={disabled}
        badge={behindCount}
        onClick={handlePull}
        data-testid="toolbar-pull-button"
      />
      <PushButton
        loading={loading.push}
        disabled={disabled}
        aheadCount={aheadCount}
        onPush={() => handlePush()}
        onPushSkippingHooks={() => handlePush({ skipHooks: true })}
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

      {/* Searching the commit list belongs to the view that draws one. The AI history search
          deliberately does NOT sit beside it: the two look alike and behave nothing alike
          (milliseconds over subjects vs minutes over every commit's diff), so it stays in the AI
          menu with the other actions that spend a model run. */}
      <ToolbarButton
        icon={<Search className="h-4 w-4 text-muted-foreground" />}
        label={t('toolbar.searchLabel')}
        title={`${t('toolbar.search')} (⌘F)`}
        disabled={disabled || !isCommitsView}
        onClick={() => useCommitSearchStore.getState().toggle()}
        data-testid="toolbar-search-button"
      />
    </>
  )
}
