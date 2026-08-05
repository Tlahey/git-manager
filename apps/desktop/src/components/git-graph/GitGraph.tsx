import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { useQueryClient } from '@tanstack/react-query'
import { Focus, X } from 'lucide-react'
import { Spinner, cn } from '@git-manager/ui'
import { useGitLog } from '../../hooks/useGitLog'
import { useGlobalLoadingWhile } from '../../hooks/useGlobalLoadingWhile'
import { useGitStatus } from '../../hooks/useGitStatus'
import { useWorktreeWipStatuses } from '../../hooks/useWorktreeWipStatuses'
import { useWorktreeAgentActivity } from '../../hooks/useWorktreeAgentActivity'
import { useGitGraphColumnsStore } from '../../stores/gitGraphColumns.store'

import { useSettingsStore } from '../../stores/settings.store'
import { useEffectiveRepoSettings } from '../../hooks/useEffectiveRepoSettings'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useCommitSelection } from '../../hooks/useCommitSelection'
import { useGraphLayout } from '../../hooks/useGraphLayout'
import { useHorizontalResize } from '@git-manager/components'
import { useGitGraphNodes } from '../../hooks/useGitGraphNodes'
import type { RebaseProgressStep } from '@git-manager/git-types'
import { useGitGraphActions } from '../../hooks/useGitGraphActions'
import { useTagContextMenu } from '../../hooks/useTagContextMenu'
import { useRebaseGraphView } from '../../hooks/useRebaseGraphView'
import { useGraphScrollSync } from '../../hooks/useGraphScrollSync'
import { useConflictMergeWindow } from '../../hooks/useConflictMergeWindow'
import { useSearchNavigation } from '../../hooks/useSearchNavigation'
import { useCommitReorderDrag } from '../../hooks/useCommitReorderDrag'
import { GraphRow } from './GraphRow'
import { TagCreationInput } from './TagCreationInput'
import { RefDropProvider } from './RefDropContext'
import { CommitDragProvider } from './CommitDragProvider'
import { CommitReorderDialog } from './CommitReorderDialog'
import { CommitDragSlot } from './components/CommitDragSlot'
import { TagMenuProvider } from './TagMenuContext'
import { GraphHeader } from './GraphHeader'
import { CommitSearchPanel } from './CommitSearchPanel'
import { CommitDetailsPanel } from './CommitDetailsPanel'
import { MultiCommitDetailsPanel } from './MultiCommitDetailsPanel'
import { DiffViewCenter } from './DiffViewCenter'
import { PrDetailCenter } from './pr/PrDetailCenter'
import { IssueDetailCenter } from './issue/IssueDetailCenter'
import { PrComposerCenter } from './pr/PrComposerCenter'
import { PrCreateCenter } from './pr/PrCreateCenter'
import { PrFileDiffCenter } from './pr/PrFileDiffCenter'
import { PrFilesPanel } from './pr/PrFilesPanel'
import { EmptyRepoPanel } from './EmptyRepoPanel'
import { PatchWorkspaceCenter } from '../patch/PatchWorkspaceCenter'
import { PatchWorkspacePanel } from '../patch/PatchWorkspacePanel'
import { PackageHealthPanel } from '../package-health/PackageHealthPanel'
import { PackageHealthCenter } from '../package-health/PackageHealthCenter'
import { usePackageHealthStore } from '../../stores/packageHealth.store'
import { usePatchWorkspaceStore } from '../../stores/patchWorkspace.store'
import { BisectPanel } from '../bisect/BisectPanel'
import { BranchExplanationPanel } from './BranchExplanationPanel'
import { AiCommitSearchPanel } from './AiCommitSearchPanel'
import { CodeReviewPanel } from './CodeReviewPanel'
import { DailySummariesPanel } from './DailySummariesPanel'
import { CommitExplanationPanel } from './CommitExplanationPanel'
import { WorkingExplanationPanel } from './WorkingExplanationPanel'
import { useBisectState } from '../../hooks/useBisectState'
import { useBisectUIStore } from '../../stores/bisectUI.store'
import { buildBisectStatusMap } from './bisectStatus'
import { isSyntheticRow } from './syntheticRows'
import { useTimelineNavStore } from '../../stores/timelineNav.store'
import { GitGraphOverlayManager } from './components/GitGraphOverlayManager'
import { ConflictResolutionPanel } from './ConflictResolutionPanel'
import { RebaseProgressCenter } from '../rebase-progress/RebaseProgressCenter'
import { Waterline } from './Waterline'
import { GraphSidePanel } from './GraphSidePanel'
import { collectGraphAuthors } from './graphAuthors'
import { useGraphAuthorFilterStore } from '../../stores/graphAuthorFilter.store'
import { useSoloModeStore } from '../../stores/soloMode.store'
import { TerminalPanel } from '../terminal/TerminalPanel'
import { TerminalStatusBar } from '../terminal/TerminalStatusBar'
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
  const queryClient = useQueryClient()
  const { protectedBranches } = useEffectiveRepoSettings(repoPath)
  const rowHeightSetting = useSettingsStore((s) => s.settings.appearance.rowHeight || 'standard')
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

  const activeDiffFile = useRepoUIStore((s) => s.activeDiffFile)
  const setActiveDiffFile = useRepoUIStore((s) => s.setActiveDiffFile)
  const activePrNumber = useRepoUIStore((s) => s.activePrNumber)
  const setActivePrNumber = useRepoUIStore((s) => s.setActivePrNumber)
  const activeIssue = useRepoUIStore((s) => s.activeIssue)
  const setActiveIssue = useRepoUIStore((s) => s.setActiveIssue)
  const activePrFile = useRepoUIStore((s) => s.activePrFile)
  const setActivePrFile = useRepoUIStore((s) => s.setActivePrFile)
  const prFilesVisible = useRepoUIStore((s) => s.prFilesVisible)
  const prComposer = useRepoUIStore((s) => s.prComposer)
  const prCreateOpen = useRepoUIStore((s) => s.prCreateOpen)
  const conflictFilePath = useRepoUIStore((s) => s.conflictFilePath)
  const setConflictFilePath = useRepoUIStore((s) => s.setConflictFilePath)
  const aiPanelTarget = useRepoUIStore((s) => s.aiPanelTarget)
  const setAiPanelTarget = useRepoUIStore((s) => s.setAiPanelTarget)

  // Patch workspace (create / apply / dependency) claims both the center and the
  // right panel, taking precedence over the commit/diff/PR views below.
  const patchMode = usePatchWorkspaceStore((s) => s.mode)
  const healthOpen = usePackageHealthStore((s) => s.open)
  const closePatch = usePatchWorkspaceStore((s) => s.close)
  // Switching repo/tab abandons any in-progress patch workspace.
  useEffect(() => {
    closePatch()
  }, [repoPath, closePatch])

  // Bisect: an active session claims the right panel (top priority) and annotates the graph rows.
  const { data: bisect } = useBisectState(repoPath)
  const bisectActive = bisect?.active ?? false
  const bisectSettingUp = useBisectUIStore((s) => s.setupActive)
  const bisectPendingBadOid = useBisectUIStore((s) => s.pendingBadOid)
  const bisectPendingGoodOid = useBisectUIStore((s) => s.pendingGoodOid)
  const bisectStatusMap = useMemo(() => {
    const map = buildBisectStatusMap(bisect)
    // While setting up, preview the chosen bad/good commits with the same row treatment.
    if (bisectPendingBadOid) map.set(bisectPendingBadOid, 'bad')
    if (bisectPendingGoodOid) map.set(bisectPendingGoodOid, 'good')
    return map
  }, [bisect, bisectPendingBadOid, bisectPendingGoodOid])

  // During graph-driven setup, a commit click fills the active bisect slot instead of selecting it.
  // Synthetic rows (WIP / CONFLICT) are not valid bisect targets.
  function handleBisectPick(oid: string) {
    if (isSyntheticRow(oid)) return
    useBisectUIStore.getState().pickCommit(oid)
  }

  useConflictMergeWindow(repoPath, conflictFilePath, setConflictFilePath)

  // While the undo/redo timeline overlay is open for this repo, the previewed commit's changes take
  // over the center (contentview) and the native right-hand detail panel is suppressed — the
  // timeline's own steps panel owns the right side instead.
  const timelinePreviewOpen = useTimelineNavStore((s) => s.isOpen && s.repoPath === repoPath)
  const timelinePreviewOid = useTimelineNavStore((s) => s.previewHeadOid)

  const pendingGraphSelection = useRepoUIStore((s) => s.pendingGraphSelection)
  const setPendingGraphSelection = useRepoUIStore((s) => s.setPendingGraphSelection)
  const setSelectedCommitOid = useRepoUIStore((s) => s.setSelectedCommitOid)
  const setSelectedCommitOids = useRepoUIStore((s) => s.setSelectedCommitOids)
  const setSelectedStashIndex = useRepoUIStore((s) => s.setSelectedStashIndex)
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
  const { data: status } = useGitStatus(repoPath)
  const totalChanges = useMemo(() => {
    if (!status) return 0
    return (
      (status.staged?.length || 0) +
      (status.unstaged?.length || 0) +
      (status.untracked?.length || 0) +
      (status.conflicted?.length || 0)
    )
  }, [status])
  const wipStats = useMemo(() => {
    if (!status) return { added: 0, modified: 0, deleted: 0 }
    let added = status.untracked?.length || 0
    let modified = status.conflicted?.length || 0
    let deleted = 0
    for (const entry of [...(status.staged || []), ...(status.unstaged || [])]) {
      if (entry.status === 'added') added++
      else if (entry.status === 'deleted') deleted++
      else modified++
    }
    return { added, modified, deleted }
  }, [status])

  // WIP status of every OTHER linked worktree with uncommitted changes — lets several "// WIP"
  // rows coexist on different branches at once (see useGitGraphNodes' worktreeWipNodes).
  const { data: worktreeWipStatuses = [] } = useWorktreeWipStatuses(repoPath)
  // Live AI-agent activity for the active repo plus every linked worktree with a WIP row — drives
  // the agent logo in the dashed ring and the working/idle status tag. Only worktrees that actually
  // carry a WIP row can surface it, so this asks about exactly those paths.
  const agentActivityPaths = useMemo(
    () => [repoPath, ...worktreeWipStatuses.map((w) => w.path)],
    [repoPath, worktreeWipStatuses]
  )
  const worktreeAgentActivity = useWorktreeAgentActivity(agentActivityPaths)
  const wipAgentActivity = useMemo(
    () => worktreeAgentActivity.find((a) => a.path === repoPath),
    [worktreeAgentActivity, repoPath]
  )
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
  } = useCommitReorderDrag({
    repoPath,
    nodes,
    selected,
    headBranchName: headBranchName ?? null,
    isRebasing: !!isRebasing,
  })

  // Reset active diff on commit selection or repo changes
  useEffect(() => {
    setActiveDiffFile(null)
  }, [primaryOid, repoPath, setActiveDiffFile])

  // Stash index (same detection as `useGitGraphActions.ts`'s native stash-menu path) when the
  // selection is a stash row, `null` otherwise. Derived via useMemo — rather than read directly
  // inside the publish effect below — so the effect's dependency is a stable primitive instead of
  // the raw `nodes` array: `nodes` (react-query's `data`, defaulted to `[]`) is a fresh reference
  // on every render while the query has no data yet, which previously fed straight into the
  // effect's deps and re-ran it (hence re-publishing to the store) on every single render. Several
  // consumers (`TabBar`, `NewTabMenu`, `UserProfile`) subscribe to the whole `repoUI` store without
  // a selector, so *any* publish — even to an unchanged value — re-renders them; that compounded
  // into a "Maximum update depth exceeded" loop. Memoizing to a primitive here means the effect
  // only re-publishes when the actual stash index changes, not on every `nodes` reference churn.
  const derivedStashIndex = useMemo(() => {
    if (!primaryOid || isSyntheticRow(primaryOid)) return null
    const stashRef = nodes
      .find((n) => n.commit.oid === primaryOid)
      ?.refs.find((r) => r.type === 'stash')
    const stashMatch = stashRef?.shortName.match(/stash@\{(\d+)\}/)
    return stashMatch ? parseInt(stashMatch[1], 10) : null
  }, [primaryOid, nodes])

  // Publish the selected commit OID to the store so out-of-tree UI (the command palette) can act on
  // it. The synthetic WIP/CONFLICT rows aren't valid commit-action targets → publish null. Cleared
  // on unmount so a closed tab doesn't leave a stale selection behind.
  useEffect(() => {
    const isRealCommit = !!primaryOid && !isSyntheticRow(primaryOid)
    setSelectedCommitOid(isRealCommit ? primaryOid : null)
    setSelectedStashIndex(derivedStashIndex)
  }, [primaryOid, derivedStashIndex, setSelectedCommitOid, setSelectedStashIndex])
  useEffect(
    () => () => {
      setSelectedCommitOid(null)
      setSelectedStashIndex(null)
    },
    [setSelectedCommitOid, setSelectedStashIndex]
  )

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
  // `RepoGraphWorkspace`, not here.
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

  // Publish the multi-selection's OIDs (newest first, like `selectedCommitNodes`) so out-of-tree
  // UI (the command palette's "create patch from selection") can act on the whole group — the
  // single `selectedCommitOid` mirror above only names the primary row. Cleared on unmount for the
  // same reason as that mirror: a closed tab must not leave a stale selection behind.
  useEffect(() => {
    setSelectedCommitOids(selectedCommitNodes.map((n) => n.commit.oid))
  }, [selectedCommitNodes, setSelectedCommitOids])
  useEffect(() => () => setSelectedCommitOids([]), [setSelectedCommitOids])

  // OIDs of the commits that would be undone by the previewed step — i.e. every real commit newer
  // than the previewed HEAD (above it in the walk). Those rows animate out (collapse + color) while
  // the timeline is open; scrubbing back toward the current position grows them back in. `null`
  // when nothing is removed (tip at the top, or a step with no commit to resolve).
  const timelinePreviewRemoved = useMemo(() => {
    if (!timelinePreviewOpen || !timelinePreviewOid) return null
    const tipIndex = renderNodes.findIndex((n) => n.commit.oid === timelinePreviewOid)
    if (tipIndex <= 0) return null
    const set = new Set<string>()
    for (let i = 0; i < tipIndex; i++) {
      const oid = renderNodes[i].commit.oid
      if (isSyntheticRow(oid)) continue
      set.add(oid)
    }
    return set
  }, [timelinePreviewOpen, timelinePreviewOid, renderNodes])

  // The conflicted-files panel needs the CONFLICT row selected *and* not dismissed. The dismissal
  // is explicit state rather than "the row got deselected", so the header's toggle (and the graph
  // banner) can put it back — see rebaseView.store.
  const isConflictPanelOpen = primaryNode?.commit.oid === 'CONFLICT' && !rebaseFilesHidden
  // Dismissing the conflict panel leaves the CONFLICT row selected (see above), which would
  // otherwise fall through to CommitDetailsPanel and render a bogus "commit" for it — so the
  // whole right-hand panel has to stay closed for that row until it's re-shown or reselected.
  const isDismissedConflictRow = primaryNode?.commit.oid === 'CONFLICT' && rebaseFilesHidden

  function closeConflictPanel() {
    hideRebaseFiles(repoPath)
    setConflictFilePath(null)
  }

  /** Header toggle for the files panel: showing it again also has to re-select the row it hangs
   * off, since the user may have navigated to another commit in the meantime. */
  function handleToggleConflictFiles() {
    if (rebaseFilesHidden || primaryNode?.commit.oid !== 'CONFLICT') {
      showRebaseFiles(repoPath)
      selectSingle('CONFLICT')
    } else {
      toggleRebaseFiles(repoPath)
    }
  }

  /**
   * Clicking a row of the rebase progress rail. The step git stopped on is the one with work to
   * do, so it opens the conflicted-files panel rather than the commit's details — that panel is
   * what actually lets the user resolve the files and continue. Every other step just points at a
   * commit to inspect, which only makes sense once the graph has it loaded.
   */
  function handleSelectRebaseStep(step: RebaseProgressStep) {
    if (step.status === 'current') {
      showRebaseFiles(repoPath)
      selectSingle('CONFLICT')
      return
    }
    if (step.oid && isRebaseStepLoaded(step)) selectSingle(step.oid)
  }

  /** A step's commit is only openable while it's in the loaded window of the graph — the details
   * panel is built from a graph node, so selecting anything else would render nothing. */
  function isRebaseStepLoaded(step: RebaseProgressStep) {
    return !!step.oid && nodes.some((n) => n.commit.oid === step.oid)
  }

  const isSelectedCommitHead = useMemo(() => {
    if (!primaryNode || isSyntheticRow(primaryNode.commit.oid)) return false
    // Strategy 1: a ref with type 'HEAD' is directly on this commit (detached HEAD)
    const hasHeadRef = primaryNode.refs.some((r) => r.type === 'HEAD')
    // Strategy 2: the commit carries the branch that HEAD currently points to
    const hasBranchRef = headBranchName
      ? primaryNode.refs.some(
          (r) =>
            r.type === 'branch' && (r.shortName === headBranchName || r.name === headBranchName)
        )
      : false
    // Strategy 3: fallback – first node in the walk is typically HEAD
    const isFirstNode = primaryNode.commit.oid === nodes[0]?.commit?.oid

    return hasHeadRef || hasBranchRef || isFirstNode
  }, [primaryNode, nodes, headBranchName])

  return (
    <RefDropProvider repoPath={repoPath}>
      <TagMenuProvider handler={openTagMenu}>
        <CommitDragProvider value={dragContext}>
          <div className="flex h-full select-none overflow-hidden">
            {/* Main area: PR view (priority), PR composer, DiffViewCenter, or virtualized table */}
            <div className="relative flex min-w-[280px] flex-1 flex-col overflow-hidden">
              {patchMode ? (
                <PatchWorkspaceCenter repoPath={repoPath} />
              ) : healthOpen ? (
                <PackageHealthCenter repoPath={repoPath} />
              ) : activePrNumber != null ? (
                activePrFile != null ? (
                  <PrFileDiffCenter
                    repoPath={repoPath}
                    prNumber={activePrNumber}
                    filename={activePrFile}
                    onClose={() => setActivePrFile(null)}
                  />
                ) : (
                  <PrDetailCenter
                    repoPath={repoPath}
                    prNumber={activePrNumber}
                    onClose={() => setActivePrNumber(null)}
                  />
                )
              ) : activeIssue != null ? (
                // The repo's own path, not the `owner/repo` the Launchpad passes: `useRepoGitHub` resolves
                // GitHub from the repo's remotes, which is exactly what the sidebar's issues came from.
                <IssueDetailCenter
                  repoPath={repoPath}
                  issueNumber={activeIssue.number}
                  issue={activeIssue}
                  onClose={() => setActiveIssue(null)}
                />
              ) : prCreateOpen ? (
                <PrCreateCenter repoPath={repoPath} />
              ) : prComposer != null ? (
                <PrComposerCenter repoPath={repoPath} />
              ) : activeDiffFile ? (
                <DiffViewCenter
                  repoPath={repoPath}
                  file={activeDiffFile}
                  onClose={() => setActiveDiffFile(null)}
                  onRefresh={() => {
                    queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
                    queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
                  }}
                />
              ) : rebaseViewOpen && rebaseState ? (
                <RebaseProgressCenter
                  repoPath={repoPath}
                  rebaseState={rebaseState}
                  onSelectStep={handleSelectRebaseStep}
                  isStepSelectable={isRebaseStepLoaded}
                  selectedOid={primaryOid}
                  filesPanelOpen={isConflictPanelOpen}
                  onToggleFilesPanel={handleToggleConflictFiles}
                />
              ) : (
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
                        className="flex-1 overflow-y-auto overflow-x-hidden"
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

                            // Timeline preview: commits newer than the previewed HEAD collapse into a thin
                            // colored marker (height + color animation) to show they'd be undone. The
                            // transition is gated on preview mode so it never adds lag to normal scrolling
                            // (where the virtualizer rewrites `translateY` on every frame).
                            const previewRemoved = timelinePreviewRemoved?.has(oid) ?? false

                            // Only the drafted row shows the inline tag input; wiring the callbacks
                            // solely on that row keeps every other (memoized) row from re-rendering.
                            const isTagDraftRow = tagDraft?.oid === oid

                            return (
                              <CommitDragSlot
                                key={virtualItem.key}
                                oid={oid}
                                testId={`graph-row-${oid}`}
                                selected={oid === primaryOid || selected.has(oid)}
                                previewRemoved={previewRemoved}
                                className={cn(
                                  'hover:z-graph-row-hover',
                                  previewRemoved && 'bg-destructive/15'
                                )}
                                style={{
                                  position: 'absolute',
                                  top: 0,
                                  left: 0,
                                  width: '100%',
                                  height: rowHeight,
                                  transformOrigin: 'top',
                                  transform: `translateY(${virtualItem.start}px)${previewRemoved ? ' scaleY(0.22)' : ''}`,
                                  opacity: previewRemoved ? 0.55 : 1,
                                  transition: timelinePreviewOpen
                                    ? 'transform 300ms ease, opacity 300ms ease, background-color 300ms ease'
                                    : undefined,
                                  overflow: previewRemoved ? 'hidden' : undefined,
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
                                  onContextMenu={(e) => openMenuAt(e, oid)}
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
              )}

              {terminalOpen ? (
                <TerminalPanel path={repoPath} />
              ) : (
                <TerminalStatusBar path={repoPath} />
              )}
            </div>

            {/* Side panel: bisect (top priority), branch explanation, patch workspace, PR files, conflict
          resolution, or commit details */}
            {bisectActive ? (
              <GraphSidePanel resizeProps={resizeProps} width={panelWidthState}>
                <BisectPanel repoPath={repoPath} />
              </GraphSidePanel>
            ) : aiPanelTarget ? (
              <GraphSidePanel resizeProps={resizeProps} width={panelWidthState}>
                {/* Keyed on the subject so switching remounts with that subject's remembered
              explanation instead of the previous one's. */}
                {aiPanelTarget.kind === 'search' ? (
                  <AiCommitSearchPanel repoPath={repoPath} onClose={() => setAiPanelTarget(null)} />
                ) : aiPanelTarget.kind === 'working' ? (
                  <WorkingExplanationPanel
                    repoPath={repoPath}
                    onClose={() => setAiPanelTarget(null)}
                  />
                ) : aiPanelTarget.kind === 'branch' ? (
                  <BranchExplanationPanel
                    key={`branch:${aiPanelTarget.branch}`}
                    repoPath={repoPath}
                    branch={aiPanelTarget.branch}
                    baseRef={aiPanelTarget.baseRef}
                    onClose={() => setAiPanelTarget(null)}
                  />
                ) : aiPanelTarget.kind === 'summaries' ? (
                  <DailySummariesPanel repoPath={repoPath} onClose={() => setAiPanelTarget(null)} />
                ) : aiPanelTarget.kind === 'reviewWorking' ? (
                  <CodeReviewPanel
                    repoPath={repoPath}
                    target={{ scope: 'working' }}
                    onClose={() => setAiPanelTarget(null)}
                  />
                ) : aiPanelTarget.kind === 'reviewBranch' ? (
                  <CodeReviewPanel
                    key={`review:${aiPanelTarget.branch}`}
                    repoPath={repoPath}
                    target={{ scope: 'branch', branch: aiPanelTarget.branch }}
                    baseRef={aiPanelTarget.baseRef}
                    onClose={() => setAiPanelTarget(null)}
                  />
                ) : (
                  <CommitExplanationPanel
                    key={`commit:${aiPanelTarget.oid}`}
                    repoPath={repoPath}
                    commit={aiPanelTarget}
                    onClose={() => setAiPanelTarget(null)}
                  />
                )}
              </GraphSidePanel>
            ) : patchMode ? (
              <GraphSidePanel resizeProps={resizeProps} width={panelWidthState}>
                <PatchWorkspacePanel repoPath={repoPath} />
              </GraphSidePanel>
            ) : healthOpen ? (
              <GraphSidePanel resizeProps={resizeProps} width={panelWidthState}>
                <PackageHealthPanel repoPath={repoPath} />
              </GraphSidePanel>
            ) : activePrNumber != null ? (
              prFilesVisible ? (
                <GraphSidePanel resizeProps={resizeProps} width={panelWidthState}>
                  <PrFilesPanel repoPath={repoPath} prNumber={activePrNumber} />
                </GraphSidePanel>
              ) : null
            ) : !timelinePreviewOpen && primaryNode && !isDismissedConflictRow ? (
              <GraphSidePanel resizeProps={resizeProps} width={panelWidthState}>
                {isConflictPanelOpen ? (
                  <ConflictResolutionPanel
                    repoPath={repoPath}
                    activeFile={conflictFilePath}
                    onSelectFile={setConflictFilePath}
                    onClose={closeConflictPanel}
                  />
                ) : isMultiSelect ? (
                  <MultiCommitDetailsPanel
                    nodes={selectedCommitNodes}
                    repoPath={repoPath}
                    onSelectFileDiff={(file) => setActiveDiffFile(file)}
                    onClose={clearSelection}
                  />
                ) : (
                  <CommitDetailsPanel
                    node={primaryNode}
                    repoPath={repoPath}
                    isHead={isSelectedCommitHead}
                    onSelectCommit={selectSingle}
                    onSelectFileDiff={(file) => setActiveDiffFile(file)}
                    onClose={clearSelection}
                  />
                )}
              </GraphSidePanel>
            ) : null}

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
              `RepoGraphWorkspace` mounts them from the shared store state this menu writes. */}
          </div>
        </CommitDragProvider>
      </TagMenuProvider>
    </RefDropProvider>
  )
}
