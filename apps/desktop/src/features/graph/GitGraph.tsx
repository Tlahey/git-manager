import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Focus, X } from 'lucide-react'
import { Spinner } from '@git-manager/ui'
import { useGitLog } from '../../hooks/useGitLog'
import { useGlobalLoadingWhile } from '../../hooks/useGlobalLoadingWhile'
import { useWipRowData } from './hooks/useWipRowData'
import { useGraphBisect } from './hooks/useGraphBisect'
import { useGraphSelectionPublish } from './hooks/useGraphSelectionPublish'
import { useConflictPanelControls } from './hooks/useConflictPanelControls'
import { isCommitHead } from './lib/isCommitHead'
import { useGitGraphColumnsStore } from '../../stores/gitGraphColumns.store'

import { useSettingsStore } from '../../stores/settings.store'
import { useEffectiveRepoSettings } from '../../hooks/useEffectiveRepoSettings'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useCommitSelection } from './hooks/useCommitSelection'
import { useGraphLayout } from './hooks/useGraphLayout'
import { useHorizontalResize } from '@git-manager/components'
import { useGitGraphNodes } from './hooks/useGitGraphNodes'
import { useGitGraphActions } from './hooks/useGitGraphActions'
import { useTagContextMenu } from './hooks/useTagContextMenu'
import { useRebaseGraphView } from './hooks/useRebaseGraphView'
import { useGraphScrollSync } from './hooks/useGraphScrollSync'
import { useConflictMergeWindow } from './hooks/useConflictMergeWindow'
import { useSearchNavigation } from './hooks/useSearchNavigation'
import { useCommitReorderDrag } from './hooks/useCommitReorderDrag'
import { useCommitReorderFocus } from './hooks/useCommitReorderFocus'
import { GraphRow } from './components/GraphRow'
import { TagCreationInput } from './components/TagCreationInput'
import { RefDropProvider } from './components/RefDropContext'
import { CommitDragProvider } from './components/CommitDragProvider'
import { CommitReorderDialog } from './components/CommitReorderDialog'
import { CommitDragSlot } from './components/CommitDragSlot'
import { TagMenuProvider } from './components/TagMenuContext'
import { GraphHeader } from './components/GraphHeader'
import { CommitSearchPanel } from './components/CommitSearchPanel'
import { EmptyRepoPanel } from './components/EmptyRepoPanel'
import { usePatchWorkspaceStore } from '../../stores/patchWorkspace.store'
import { isSyntheticRow } from './lib/syntheticRows'
import { useTimelineNavStore } from '../../stores/timelineNav.store'
import { GitGraphOverlayManager } from './components/GitGraphOverlayManager'
import { Waterline } from './components/Waterline'
import { GraphCenterPane } from './components/GraphCenterPane'
import { GraphSidePanelSlot } from './components/GraphSidePanelSlot'
import { collectGraphAuthors } from './lib/graphAuthors'
import { useGraphAuthorFilterStore } from './stores/graphAuthorFilter.store'
import { useSoloModeStore } from '../../stores/soloMode.store'
import { TerminalPanel } from '../../components/terminal/TerminalPanel'
import { TerminalStatusBar } from '../../components/terminal/TerminalStatusBar'
import { useTerminalStore } from '../../stores/terminal.store'

interface GitGraphProps {
  repoPath: string
  branch?: string
  /** Solo mode: branch shortNames to isolate — the graph loads only commits reachable from these,
   * taking precedence over the single-branch `branch` filter. */
  soloBranches?: string[]
  /** Global search coming from the action toolbar. */
  searchQuery?: string
  onSelectCommit?: (oid: string) => void
}

// Row height is dynamic now based on settings

const EMPTY_ARRAY: string[] = []

export function GitGraph({
  repoPath,
  branch,
  soloBranches,
  searchQuery,
  onSelectCommit,
}: GitGraphProps) {
  const { t } = useTranslation('git')
  const terminalOpen = useTerminalStore((s) => s.open)
  const { protectedBranches } = useEffectiveRepoSettings(repoPath)
  const rowHeightSetting = useSettingsStore((s) => s.settings.appearance.rowHeight ?? 'small')
  const rowHeight = rowHeightSetting === 'small' ? 32 : 40
  // Current HEAD branch name from repo cache (e.g. "main", "feat/xyz")
  const headBranchName = useRepoDataStore((s) => s.repoCache[repoPath]?.head)
  const headIsDetached = useRepoDataStore((s) => s.repoCache[repoPath]?.isDetached ?? false)
  // A linked worktree's `mainWorktreePath` points at the owning repo, not itself — so when it
  // differs from `repoPath` the active view is a worktree (its "// WIP" tag uses the worktree icon).
  const activeRepoIsWorktree = useRepoDataStore((s) => {
    const cached = s.repoCache[repoPath]
    return !!cached?.mainWorktreePath && cached.mainWorktreePath !== repoPath
  })
  // Ref shown in the primary "// WIP" row's tag (own repo's current branch / worktree).
  const wipRef = useMemo(
    () => (headBranchName ? { name: headBranchName, isWorktree: activeRepoIsWorktree } : undefined),
    [headBranchName, activeRepoIsWorktree]
  )

  // ── Sizing / Resizing details panel hook ───────────────────────────────────
  const { width: panelWidthState, resizeProps } = useHorizontalResize(400)

  const setActiveDiffFile = useRepoUIStore((s) => s.setActiveDiffFile)
  const conflictFilePath = useRepoUIStore((s) => s.conflictFilePath)
  const setConflictFilePath = useRepoUIStore((s) => s.setConflictFilePath)

  // Patch workspace (create / apply / dependency) claims both the center and the
  // right panel, taking precedence over the commit/diff/PR views below.
  const closePatch = usePatchWorkspaceStore((s) => s.close)
  // Switching repo/tab abandons any in-progress patch workspace.
  useEffect(() => {
    closePatch()
  }, [repoPath, closePatch])

  // Bisect: an active session claims the right panel (top priority) and annotates the graph rows.
  const {
    isActive: bisectActive,
    isSettingUp: bisectSettingUp,
    statusMap: bisectStatusMap,
    pickCommit: handleBisectPick,
  } = useGraphBisect(repoPath)

  useConflictMergeWindow(repoPath, conflictFilePath, setConflictFilePath)

  // While the undo/redo timeline overlay is open for this repo, the graph shows the history the
  // repository *would* have at the previewed step — see `previewOverride` below — and the native
  // right-hand detail panel is suppressed, the timeline's own steps panel owning that side.
  const timelinePreviewOpen = useTimelineNavStore((s) => s.isOpen && s.repoPath === repoPath)
  const timelinePreviewOid = useTimelineNavStore((s) => s.previewHeadOid)

  const pendingGraphSelection = useRepoUIStore((s) => s.pendingGraphSelection)
  const setPendingGraphSelection = useRepoUIStore((s) => s.setPendingGraphSelection)
  const hiddenStashes = useRepoDataStore((s) => s.hiddenStashes[repoPath]) || EMPTY_ARRAY
  // Tags the user chose to keep off the graph. Unlike hidden stashes — which the backend drops
  // from the log entirely — this only suppresses the badge, so it is filtered here at render time.
  const hiddenTags = useRepoDataStore((s) => s.hiddenTags[repoPath]) || EMPTY_ARRAY
  // Same deal for branches hidden from the sidebar, local and remote alike.
  const hiddenBranches = useRepoDataStore((s) => s.hiddenBranches[repoPath]) || EMPTY_ARRAY
  const toggleStashVisibility = useRepoDataStore((s) => s.toggleStashVisibility)

  // ── Rebase state (for the synthetic conflict row in the graph, and the rebase progress view) ──
  const {
    rebaseState,
    isRebasePaused,
    isRebasing,
    conflictInfo,
    rebaseViewOpen,
    rebaseFilesHidden,
    showRebaseProgress,
    showRebaseFiles,
    hideRebaseFiles,
    toggleRebaseFiles,
  } = useRebaseGraphView(repoPath)

  // ── Status detection & WIP Node ──────────────────────────────────────────
  const {
    status,
    totalChanges,
    wipStats,
    worktreeWipStatuses,
    worktreeAgentActivity,
    wipAgentActivity,
  } = useWipRowData(repoPath)
  // Opening a worktree is a view switch, not a new tab — it only sets which path the graph/sidebar
  // render data for (see repoUI.store.ts's `activeWorkspacePath`).
  const setActiveWorkspacePath = useRepoUIStore((s) => s.setActiveWorkspacePath)

  // ── Columns ────────────────────────────────────────────────────────────────
  const columnState = useGitGraphColumnsStore((s) => s.columns)

  // ── Author filter (the "author" column) ─────────────────────────────────────
  const selectedAuthors = useGraphAuthorFilterStore((s) => s.selected)
  const clearAuthorFilter = useGraphAuthorFilterStore((s) => s.clear)
  // ── Solo mode (branch-visibility filter, driven from the sidebar) ───────────
  const soloActive = useSoloModeStore((s) => s.active)
  const clearSolo = useSoloModeStore((s) => s.clear)
  // Both filters are repo-specific: a set left over from another repo would blank/wrong-filter the
  // graph. Reset them whenever the active repo changes.
  useEffect(() => {
    clearAuthorFilter()
    clearSolo()
  }, [repoPath, clearAuthorFilter, clearSolo])

  const showStashesInGraph = useSettingsStore((s) => s.settings.git.showStashesInGraph ?? true)
  // How many commits to load on first render. Clamped to the documented 500 floor so a stale/edited
  // persisted value can't starve the graph.
  const initialGraphCommits = useSettingsStore((s) =>
    Math.max(500, s.settings.git.initialGraphCommits ?? 2000)
  )

  // Timeline preview: ask the backend for the graph as if the checked-out branch pointed at the
  // previewed step's commit. This is what makes the preview show the *state*, rather than annotate
  // the current one — the lanes, colours and badges come out of the same Rust layout code as the
  // real graph, and it works in the redo direction too, where the commits to bring back are only
  // reachable from their undo pins. Nothing is written; validating is still what applies it.
  const previewOverride = useMemo(
    () =>
      timelinePreviewOpen && timelinePreviewOid
        ? { branch: headIsDetached ? '' : (headBranchName ?? ''), oid: timelinePreviewOid }
        : undefined,
    [timelinePreviewOpen, timelinePreviewOid, headIsDetached, headBranchName]
  )

  const {
    data: nodes = [],
    isLoading,
    isError,
  } = useGitLog(repoPath, {
    limit: initialGraphCommits,
    branch: branch || undefined,
    soloBranches: soloActive && soloBranches && soloBranches.length > 0 ? soloBranches : undefined,
    showStashes: showStashesInGraph,
    hiddenStashes,
    // The WIP / paused-rebase row is an INPUT of the Rust column layout: when it exists it is the
    // graph's first element, so the lane running down to HEAD's tip must own column 0. Same
    // condition as useGitGraphNodes' "primary special row" (conflict row wins over WIP).
    headHasWip: isRebasePaused || totalChanges > 0,
    headOverride: previewOverride,
  })

  // Surface the whole-app loading overlay (dark scrim + animated mascot) while the graph loads
  // its history for the first time — i.e. when switching to a repo whose data isn't cached yet.
  useGlobalLoadingWhile(isLoading, t('gitTree.loading'))

  // Unique authors of the loaded commits, for the AUTHOR column filter autocomplete.
  const authorOptions = useMemo(() => collectGraphAuthors(nodes), [nodes])

  // ── Derive the graph's display data (WIP, conflict, search, waterlines) ────
  const {
    wipNode,
    conflictNode,
    filteredNodes,
    renderNodes,
    waterlines,
    matchingOids,
    authorMatchingOids,
  } = useGitGraphNodes(
    nodes,
    searchQuery,
    totalChanges,
    t,
    conflictInfo,
    worktreeWipStatuses,
    selectedAuthors
  )

  // The commit list's scroll container — shared by the virtualizer (vertical) and the graph
  // column's own horizontal panning.
  const parentRef = useRef<HTMLDivElement | null>(null)

  // Column layout geometry (lane count, resolved widths, scroll/overflow zone), the branch-lane
  // hint map, and the search/author-filter/drag-highlight lookup sets — see useGraphLayout.
  const {
    laneRefByOid,
    graphMaxColumn,
    visibleColumns,
    graphScrollX,
    scrollToColumn,
    graphOverflowZone,
    matchSet,
    totalMatches,
    authorMatchSet,
    dragHighlightSet,
  } = useGraphLayout({
    nodes,
    renderNodes,
    columnState,
    rowHeight,
    matchingOids,
    authorMatchingOids,
    parentRef,
  })

  // ── Search result navigation (up/down in the floating CommitSearchPanel) ───────────────────
  const { clampedMatchIndex, goToNextMatch, goToPreviousMatch } = useSearchNavigation(
    searchQuery,
    totalMatches
  )

  // ── Selection (multiple) hook ───────────────────────────────────────────────
  const {
    selected,
    setSelected,
    primaryOid,
    setPrimaryOid,
    selectSingle,
    handleRowSelect,
    clearSelection,
  } = useCommitSelection(filteredNodes, onSelectCommit)

  // ── Drag-and-drop reorder / combine (commits dragged inside the graph) ──────
  const {
    dragContext,
    pending: pendingReorder,
    busy: reorderBusy,
    confirm: confirmReorder,
    cancel: cancelReorder,
    landed: landedReorder,
    clearLanded: clearLandedReorder,
  } = useCommitReorderDrag({
    repoPath,
    nodes,
    selected,
    headBranchName: headBranchName ?? null,
    isRebasing: !!isRebasing,
    enabled: !timelinePreviewOpen,
  })

  // Reset active diff on commit selection or repo changes
  useEffect(() => {
    setActiveDiffFile(null)
  }, [primaryOid, repoPath, setActiveDiffFile])

  // ── Native context menu (macOS) + dialogs + graph actions ─────────────────
  const {
    pendingAction,
    setPendingAction,
    tagDraft,
    submitTagDraft,
    cancelTagDraft,
    openMenuAt,
    handleCommitWip,
  } = useGitGraphActions({
    repoPath,
    nodes,
    selected,
    setPrimaryOid,
    selectSingle,
    primaryOid,
    hiddenStashes,
    toggleStashVisibility,
    status,
    currentBranch: headBranchName ?? null,
    isDetached: headIsDetached,
    t,
  })

  // Tag badge right-click menu: reuses the commit dialogs above (via selectSingle +
  // setPendingAction). Its own two dialogs are opened on the shared store and mounted by
  // `RepoWorkspace`, not here.
  const { openTagMenu } = useTagContextMenu({
    repoPath,
    currentBranch: headBranchName ?? null,
    isDetached: headIsDetached,
    selectCommit: selectSingle,
    setPendingCommitAction: setPendingAction,
    t,
  })

  // ── Virtualisation + scroll sync ──────────────────────────────────────────
  // (the scroll container's ref is declared with the graph column's scroll geometry above)
  const { virtualizer } = useGraphScrollSync({
    parentRef,
    rowHeight,
    nodes,
    filteredNodes,
    conflictNode,
    isRebasePaused,
    branch,
    repoPath,
    primaryOid,
    selectSingle,
    matchingOids,
    clampedMatchIndex,
    pendingGraphSelection,
    setPendingGraphSelection,
    t,
  })

  // Follow the commits a drag just moved into the rewritten history — they come back with new
  // OIDs, so the selection is re-derived by position once the reloaded log arrives.
  useCommitReorderFocus({
    landed: landedReorder,
    clearLanded: clearLandedReorder,
    nodes,
    filteredNodes,
    headBranchName: headBranchName ?? null,
    setSelected,
    setPrimaryOid,
    scrollToIndex: virtualizer.scrollToIndex,
  })

  const primaryNode = useMemo(() => {
    if (!primaryOid) return null
    if (primaryOid === 'WIP') return wipNode
    if (primaryOid === 'CONFLICT') return conflictNode
    return nodes.find((n) => n.commit.oid === primaryOid) ?? null
  }, [primaryOid, nodes, wipNode, conflictNode])

  // Real commits currently multi-selected, kept in graph order (newest first). The synthetic
  // WIP/CONFLICT rows never take part in a merged-diff selection. When more than one is selected the
  // right panel swaps to the multi-commit summary instead of a single commit's details.
  const selectedCommitNodes = useMemo(() => {
    if (selected.size < 2) return []
    return filteredNodes.filter((n) => {
      const oid = n.commit.oid
      return selected.has(oid) && !isSyntheticRow(oid)
    })
  }, [selected, filteredNodes])
  const isMultiSelect = selectedCommitNodes.length > 1

  // Mirrors what is selected into the shared store, for the command palette to act on. Placed here
  // rather than beside the other effects because it needs `selectedCommitNodes`, resolved just
  // above — see the hook for why the stash index must stay a memoized primitive.
  useGraphSelectionPublish({ primaryOid, nodes, selectedCommitNodes })

  const {
    isOpen: isConflictPanelOpen,
    isDismissedRow: isDismissedConflictRow,
    close: closeConflictPanel,
    toggle: handleToggleConflictFiles,
    selectStep: handleSelectRebaseStep,
    isStepLoaded: isRebaseStepLoaded,
  } = useConflictPanelControls({
    repoPath,
    primaryNode,
    nodes,
    rebaseFilesHidden,
    showRebaseFiles,
    hideRebaseFiles,
    toggleRebaseFiles,
    selectSingle,
    setConflictFilePath,
  })

  const isSelectedCommitHead = useMemo(
    () => isCommitHead(primaryNode, nodes, headBranchName),
    [primaryNode, nodes, headBranchName]
  )

  return (
    <RefDropProvider repoPath={repoPath}>
      <TagMenuProvider handler={openTagMenu}>
        <CommitDragProvider value={dragContext}>
          <div className="flex h-full overflow-hidden select-none">
            {/* Main area: PR view (priority), PR composer, DiffViewCenter, or virtualized table */}
            <div className="relative flex min-w-[280px] flex-1 flex-col overflow-hidden">
              <GraphCenterPane
                repoPath={repoPath}
                rebaseViewOpen={rebaseViewOpen}
                rebaseState={rebaseState}
                onSelectRebaseStep={handleSelectRebaseStep}
                isRebaseStepSelectable={isRebaseStepLoaded}
                selectedOid={primaryOid}
                filesPanelOpen={isConflictPanelOpen}
                onToggleFilesPanel={handleToggleConflictFiles}
              >
                <>
                  <CommitSearchPanel
                    resultCount={totalMatches}
                    activeIndex={clampedMatchIndex}
                    onPrevious={goToPreviousMatch}
                    onNext={goToNextMatch}
                  />

                  {soloActive && (
                    <div
                      className="flex shrink-0 items-center gap-2 border-b border-primary/30 bg-primary/10 px-3 py-1.5 text-xs text-primary"
                      data-testid="graph-solo-banner"
                    >
                      <Focus className="h-3.5 w-3.5 shrink-0" />
                      <span className="flex-1 truncate font-medium">
                        {t('sidebar.solo.active', { count: soloBranches?.length ?? 0 })}
                      </span>
                      <button
                        onClick={clearSolo}
                        className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors hover:bg-primary/20"
                        data-testid="graph-solo-clear"
                      >
                        <X className="h-3 w-3" />
                        {t('sidebar.solo.clear')}
                      </button>
                    </div>
                  )}

                  {/* When the refs column is hidden there's no row cell to host the inline tag input, so
                the tag name is entered from a top bar instead. */}
                  {tagDraft && !visibleColumns.some((c) => c.key === 'refs') && (
                    <TagCreationInput
                      variant="bar"
                      onSubmit={submitTagDraft}
                      onCancel={cancelTagDraft}
                    />
                  )}

                  {isLoading && (
                    <div className="flex flex-1 items-center justify-center">
                      <Spinner className="h-5 w-5 text-muted-foreground" />
                      <span className="ml-2 text-sm text-muted-foreground">
                        {t('gitTree.loading')}
                      </span>
                    </div>
                  )}

                  {isError && (
                    <div className="flex flex-1 items-center justify-center">
                      <p className="text-sm text-destructive">{t('gitGraph.loadError')}</p>
                    </div>
                  )}

                  {!isLoading && !isError && nodes.length === 0 && (
                    <EmptyRepoPanel repoPath={repoPath} />
                  )}

                  {!isLoading && !isError && nodes.length > 0 && (
                    <>
                      <GraphHeader columns={visibleColumns} authorOptions={authorOptions} />

                      <div
                        ref={parentRef}
                        data-testid="commit-graph"
                        className="flex-1 overflow-x-hidden overflow-y-auto"
                      >
                        <div
                          style={{
                            height: virtualizer.getTotalSize(),
                            width: '100%',
                            position: 'relative',
                          }}
                        >
                          {virtualizer.getVirtualItems().map((virtualItem) => {
                            const node = renderNodes[virtualItem.index]
                            const oid = node.commit.oid

                            // Dim rows the active filters exclude. Search and the author filter combine
                            // with OR: a row stays fully visible if it matches EITHER active filter, and
                            // is dimmed only when both are active-and-unmatched (or the single active one
                            // is unmatched). With neither filter active, nothing is dimmed.
                            const searchActive = matchSet !== null
                            const authorActive = authorMatchSet !== null
                            // A drag-hovered ref takes over the dimming: only its commits stay lit.
                            const dimmed = dragHighlightSet
                              ? !dragHighlightSet.has(oid)
                              : (searchActive || authorActive) &&
                                !(searchActive && matchSet.has(oid)) &&
                                !(authorActive && authorMatchSet.has(oid))

                            // Only the drafted row shows the inline tag input; wiring the callbacks
                            // solely on that row keeps every other (memoized) row from re-rendering.
                            const isTagDraftRow = tagDraft?.oid === oid

                            return (
                              <CommitDragSlot
                                key={virtualItem.key}
                                oid={oid}
                                testId={`graph-row-${oid}`}
                                selected={oid === primaryOid || selected.has(oid)}
                                className="hover:z-graph-row-hover"
                                style={{
                                  position: 'absolute',
                                  top: 0,
                                  left: 0,
                                  width: '100%',
                                  height: rowHeight,
                                  transform: `translateY(${virtualItem.start}px)`,
                                }}
                              >
                                <GraphRow
                                  node={node}
                                  columns={visibleColumns}
                                  isSelected={selected.has(oid)}
                                  isPrimary={oid === primaryOid}
                                  onSelect={(e) => {
                                    scrollToColumn(node.column)
                                    if (bisectSettingUp) {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      handleBisectPick(oid)
                                      return
                                    }
                                    // The CONFLICT row is the paused rebase's banner: clicking it
                                    // brings both rebase panels back. It must *set* them visible, never
                                    // toggle — `handleRowSelect` clears the selection when the row is
                                    // already the primary one (which it normally is during a pause), and
                                    // that closed the files panel the user had just asked to see.
                                    if (oid === 'CONFLICT') {
                                      showRebaseProgress(repoPath)
                                      showRebaseFiles(repoPath)
                                      selectSingle('CONFLICT')
                                      return
                                    }
                                    handleRowSelect(e, virtualItem.index)
                                  }}
                                  // The previewed graph is a history the repository does not have
                                  // yet; a commit action fired from it would target the wrong thing.
                                  onContextMenu={(e) => {
                                    if (!timelinePreviewOpen) openMenuAt(e, oid)
                                  }}
                                  wipStats={wipStats}
                                  onCommitWip={handleCommitWip}
                                  isFirst={virtualItem.index === 0}
                                  conflictInfo={conflictInfo}
                                  dimmed={dimmed}
                                  bisectStatus={bisectStatusMap.get(oid)}
                                  worktreeWipStatuses={worktreeWipStatuses}
                                  onOpenWorktree={setActiveWorkspacePath}
                                  worktreeAgentActivity={worktreeAgentActivity}
                                  wipAgentActivity={wipAgentActivity}
                                  wipRef={wipRef}
                                  laneRef={laneRefByOid.get(oid)}
                                  graphMaxColumn={graphMaxColumn}
                                  graphScrollX={graphScrollX}
                                  hiddenTags={hiddenTags}
                                  hiddenBranches={hiddenBranches}
                                  isTagDraft={isTagDraftRow}
                                  onSubmitTag={isTagDraftRow ? submitTagDraft : undefined}
                                  onCancelTag={isTagDraftRow ? cancelTagDraft : undefined}
                                />
                              </CommitDragSlot>
                            )
                          })}

                          {/* Overflow zone: full height, above the colored bands (z-graph-overflow) but
                        below the cells (z-content) — markers stay visible. */}
                          {graphOverflowZone && (
                            <div
                              data-testid="graph-overflow-zone"
                              className="pointer-events-none absolute inset-y-0 z-graph-overflow"
                              style={{
                                left: graphOverflowZone.left,
                                width: graphOverflowZone.width,
                                opacity: graphOverflowZone.opacity,
                                // The zone is a transparent "card": its content keeps its own colors,
                                // only an outer shadow on its left edge detaches it from the rest of
                                // the graph.
                                boxShadow: '-8px 0 12px -4px rgb(0 0 0 / 0.35)',
                              }}
                            />
                          )}

                          {/* Waterlines: full-width overlays on the boundaries, out of flow */}
                          {waterlines.map((wl) => (
                            <div
                              key={wl.id}
                              className="pointer-events-none absolute left-0 z-content w-full"
                              style={{
                                top: 0,
                                height: rowHeight,
                                transform: `translateY(${wl.index * rowHeight - rowHeight / 2}px)`,
                              }}
                            >
                              <Waterline label={wl.label} />
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </>
              </GraphCenterPane>

              {terminalOpen ? (
                <TerminalPanel path={repoPath} />
              ) : (
                <TerminalStatusBar path={repoPath} />
              )}
            </div>

            {/* Side panel: bisect (top priority), branch explanation, patch workspace, PR files, conflict
          resolution, or commit details */}
            <GraphSidePanelSlot
              repoPath={repoPath}
              resizeProps={resizeProps}
              width={panelWidthState}
              bisectActive={bisectActive}
              timelinePreviewOpen={timelinePreviewOpen}
              isDismissedConflictRow={isDismissedConflictRow}
              primaryNode={primaryNode}
              isConflictPanelOpen={isConflictPanelOpen}
              onCloseConflictPanel={closeConflictPanel}
              isMultiSelect={isMultiSelect}
              selectedCommitNodes={selectedCommitNodes}
              isSelectedCommitHead={isSelectedCommitHead}
              onSelectCommit={selectSingle}
              onSelectFileDiff={(file) => setActiveDiffFile(file)}
              onClearSelection={clearSelection}
            />

            {/* Overlays (dialogs triggered by the native menu) */}
            <GitGraphOverlayManager
              repoPath={repoPath}
              nodes={nodes}
              primaryOid={primaryOid}
              protectedBranches={protectedBranches}
              pendingAction={pendingAction}
              onClearPendingAction={() => setPendingAction(null)}
            />

            {/* Confirmation for a commit dropped on another commit (combine) or into a gap
              (reorder) — nothing is rewritten until it is accepted. */}
            <CommitReorderDialog
              pending={pendingReorder}
              busy={reorderBusy}
              onCancel={cancelReorder}
              onConfirm={(mode) => void confirmReorder(mode)}
            />

            {/* The tag dialogs and the remote-branch delete confirmation are NOT mounted here: they
              are about a ref rather than a commit in this page, and this component is unmounted
              whenever the file explorer is open — which used to take an open dialog down with it.
              `RepoWorkspace` mounts them from the shared store state this menu writes. */}
          </div>
        </CommitDragProvider>
      </TagMenuProvider>
    </RefDropProvider>
  )
}
