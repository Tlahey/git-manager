import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useTranslation } from '@git-manager/i18n'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Spinner, toast } from '@git-manager/ui'
import { useGitLog } from '../../hooks/useGitLog'
import { useGitStatus } from '../../hooks/useGitStatus'
import { useWorktreeWipStatuses } from '../../hooks/useWorktreeWipStatuses'
import { useWorktreeAgentActivity } from '../../hooks/useWorktreeAgentActivity'
import { useGitGraphColumnsStore } from '../../stores/gitGraphColumns.store'

import { useSettingsStore } from '../../stores/settings.store'
import { useEffectiveRepoSettings } from '../../hooks/useEffectiveRepoSettings'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useCommitSelection } from '../../hooks/useCommitSelection'
import { useHorizontalResize } from '@git-manager/components'
import { useGitGraphNodes, type ConflictRowInfo } from '../../hooks/useGitGraphNodes'
import { useGitGraphActions } from '../../hooks/useGitGraphActions'
import { apiGetRebaseState } from '../../api/git.api'
import { GraphRow } from './GraphRow'
import { RefDropProvider } from './RefDropContext'
import { useRefDragStore } from '../../stores/refDrag.store'
import { GraphHeader } from './GraphHeader'
import { CommitSearchPanel } from './CommitSearchPanel'
import { CommitDetailsPanel } from './CommitDetailsPanel'
import { MultiCommitDetailsPanel } from './MultiCommitDetailsPanel'
import { DiffViewCenter } from './DiffViewCenter'
import { PrDetailCenter } from './pr/PrDetailCenter'
import { PrComposerCenter } from './pr/PrComposerCenter'
import { PrCreateCenter } from './pr/PrCreateCenter'
import { PrFileDiffCenter } from './pr/PrFileDiffCenter'
import { PrFilesPanel } from './pr/PrFilesPanel'
import { EmptyRepoPanel } from './EmptyRepoPanel'
import { PatchWorkspaceCenter } from '../patch/PatchWorkspaceCenter'
import { PatchWorkspacePanel } from '../patch/PatchWorkspacePanel'
import { usePatchWorkspaceStore } from '../../stores/patchWorkspace.store'
import { useTimelineNavStore } from '../../stores/timelineNav.store'
import { GitGraphOverlayManager } from './components/GitGraphOverlayManager'
import { ConflictResolutionPanel } from './ConflictResolutionPanel'
import { Waterline } from './Waterline'
import { COLUMN_DEFS, COLUMN_ORDER, type ResolvedColumn } from './columns.config'
import { getGraphColumnLayout, getGraphMaxWidth } from './graphColumnSizing'
import { collectGraphAuthors } from './graphAuthors'
import { computeLaneBranchByOid, collectRefDropHighlight } from './laneBranch'
import { useGraphAuthorFilterStore } from '../../stores/graphAuthorFilter.store'

interface GitGraphProps {
  repoPath: string
  branch?: string
  /** Recherche globale issue de la barre d'actions (Partie 2). */
  searchQuery?: string
  onSelectCommit?: (oid: string) => void
}

// Row height is dynamic now based on settings

const EMPTY_ARRAY: string[] = []

export function GitGraph({ repoPath, branch, searchQuery, onSelectCommit }: GitGraphProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const { protectedBranches } = useEffectiveRepoSettings(repoPath)
  const rowHeightSetting = useSettingsStore((s) => s.settings.appearance.rowHeight || 'standard')
  const rowHeight = rowHeightSetting === 'small' ? 32 : 40
  // Current HEAD branch name from repo cache (e.g. "main", "feat/xyz")
  const headBranchName = useRepoDataStore((s) => s.repoCache[repoPath]?.head)
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
  const activePrFile = useRepoUIStore((s) => s.activePrFile)
  const setActivePrFile = useRepoUIStore((s) => s.setActivePrFile)
  const prFilesVisible = useRepoUIStore((s) => s.prFilesVisible)
  const prComposer = useRepoUIStore((s) => s.prComposer)
  const prCreateOpen = useRepoUIStore((s) => s.prCreateOpen)
  const conflictFilePath = useRepoUIStore((s) => s.conflictFilePath)
  const setConflictFilePath = useRepoUIStore((s) => s.setConflictFilePath)

  // Patch workspace (create / apply / dependency) claims both the center and the
  // right panel, taking precedence over the commit/diff/PR views below.
  const patchMode = usePatchWorkspaceStore((s) => s.mode)
  const closePatch = usePatchWorkspaceStore((s) => s.close)
  // Switching repo/tab abandons any in-progress patch workspace.
  useEffect(() => {
    closePatch()
  }, [repoPath, closePatch])

  useEffect(() => {
    if (!conflictFilePath) return

    const openMergeWindow = async () => {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
      const safeLabel = `merge-${repoPath.replace(/[^a-zA-Z0-9_-]/g, '-')}-${conflictFilePath.replace(/[^a-zA-Z0-9_-]/g, '-')}`
      const url = `/?window=merge&repoPath=${encodeURIComponent(repoPath)}&filePath=${encodeURIComponent(conflictFilePath)}`

      const existing = await WebviewWindow.getByLabel(safeLabel)
      if (existing) {
        await existing.show()
        await existing.setFocus()
      } else {
        new WebviewWindow(safeLabel, {
          url,
          title: `Conflict Resolution - ${conflictFilePath}`,
          width: 1200,
          height: 800,
          minWidth: 900,
          minHeight: 600,
          decorations: true,
        })
      }
      setConflictFilePath(null)
    }

    openMergeWindow()
  }, [conflictFilePath, repoPath, setConflictFilePath])

  // While the undo/redo timeline overlay is open for this repo, the previewed commit's changes take
  // over the center (contentview) and the native right-hand detail panel is suppressed — the
  // timeline's own steps panel owns the right side instead.
  const timelinePreviewOpen = useTimelineNavStore(
    (s) => s.isOpen && s.repoPath === repoPath
  )
  const timelinePreviewOid = useTimelineNavStore((s) => s.previewHeadOid)

  const pendingGraphSelection = useRepoUIStore((s) => s.pendingGraphSelection)
  const setPendingGraphSelection = useRepoUIStore((s) => s.setPendingGraphSelection)
  const setSelectedCommitOid = useRepoUIStore((s) => s.setSelectedCommitOid)
  const setSelectedStashIndex = useRepoUIStore((s) => s.setSelectedStashIndex)
  const pendingGraphAction = useRepoUIStore((s) => s.pendingGraphAction)
  const setPendingGraphAction = useRepoUIStore((s) => s.setPendingGraphAction)
  const hiddenStashes = useRepoDataStore((s) => s.hiddenStashes[repoPath]) || EMPTY_ARRAY
  const toggleStashVisibility = useRepoDataStore((s) => s.toggleStashVisibility)

  // ── Rebase state (for the synthetic conflict row in the graph) ─────────────
  const { data: rebaseState } = useQuery({
    queryKey: ['rebase-state', repoPath],
    queryFn: () => apiGetRebaseState(repoPath),
    enabled: !!repoPath,
    refetchInterval: 4000,
  })
  const isRebasePaused = rebaseState?.kind === 'conflict' || rebaseState?.kind === 'edit_pause'
  const conflictInfo: ConflictRowInfo | null = isRebasePaused
    ? { count: rebaseState?.conflictedFiles?.length ?? 0, branchName: rebaseState?.branchName }
    : null

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

  // ── Colonnes ──────────────────────────────────────────────────────────────
  const columnState = useGitGraphColumnsStore((s) => s.columns)

  // ── Filtre par auteur (colonne « auteur ») ─────────────────────────────────
  const selectedAuthors = useGraphAuthorFilterStore((s) => s.selected)
  const clearAuthorFilter = useGraphAuthorFilterStore((s) => s.clear)
  // Emails are repo-specific, so a filter left over from another repo would blank the whole graph.
  // Reset it whenever the active repo changes.
  useEffect(() => {
    clearAuthorFilter()
  }, [repoPath, clearAuthorFilter])

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
    showStashes: showStashesInGraph,
    hiddenStashes,
    // The WIP / paused-rebase row is an INPUT of the Rust column layout: when it exists it is the
    // graph's first element, so the lane running down to HEAD's tip must own column 0. Same
    // condition as useGitGraphNodes' "primary special row" (conflict row wins over WIP).
    headHasWip: isRebasePaused || totalChanges > 0,
  })

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

  // Largest lane occupied by the graph (nodes + connection lines): determines the width beyond
  // which widening the graph column brings nothing, and the display mode (full / overflow /
  // compact) shared by every row.
  const graphMaxColumn = useMemo(() => {
    let max = 0
    for (const n of renderNodes) {
      if (n.column > max) max = n.column
      for (const c of n.connections) {
        if (c.fromColumn > max) max = c.fromColumn
        if (c.toColumn > max) max = c.toColumn
      }
    }
    return max
  }, [renderNodes])

  // For a commit that carries no ref badge of its own, we still hint — faintly, on hover — which
  // branch's lane it sits on. Ownership is derived by walking first-parent chains from branch tips
  // (see computeLaneBranchByOid); lane colour can't be used because the backend palette recycles.
  const laneRefByOid = useMemo(() => computeLaneBranchByOid(nodes), [nodes])

  const avatarSize = rowHeight === 32 ? 24 : 32
  const visibleColumns: ResolvedColumn[] = useMemo(() => {
    // The graph column never exceeds the graph's actually useful width, even if a wider value
    // was persisted (the flex `message` column absorbs the difference).
    const graphMaxWidth = Math.max(
      getGraphMaxWidth(graphMaxColumn, avatarSize),
      COLUMN_DEFS.graph.minWidth
    )
    return COLUMN_ORDER.filter((k) => columnState[k].visible).map((k) =>
      k === 'graph'
        ? {
            ...COLUMN_DEFS[k],
            width: Math.min(columnState[k].width, graphMaxWidth),
            maxWidth: graphMaxWidth,
          }
        : { ...COLUMN_DEFS[k], width: columnState[k].width }
    )
  }, [columnState, graphMaxColumn, avatarSize])

  // Graph column overflow zone: a single continuous overlay spanning the whole list height (one
  // segment per row left a one-pixel shadowless seam between rows).
  const graphOverflowZone = useMemo(() => {
    const graphCol = visibleColumns.find((c) => c.key === 'graph')
    if (!graphCol) return null
    const layout = getGraphColumnLayout(graphCol.width, graphMaxColumn, avatarSize)
    if (layout.overlayOpacity <= 0) return null
    const refsCol = visibleColumns.find((c) => c.key === 'refs')
    // Same fallback convention as GraphRow (band/markers) to stay pixel-aligned.
    const refsWidth = refsCol ? refsCol.width : 160
    return {
      left: refsWidth + 8 + layout.overlayStart,
      // The zone grows with the width deficit (overlayStart recedes progressively) and stops
      // 3px before the column's edge to keep the colored border-right visible.
      width: Math.max(0, layout.innerWidth - layout.overlayStart - 3),
      // Shadow fade while the zone grows and over the compact range.
      opacity: layout.overlayOpacity,
    }
  }, [visibleColumns, graphMaxColumn, avatarSize])

  // Set for O(1) row-level "does this commit match the active search" lookups (see `dimmed`
  // below) — `null` mirrors `matchingOids`'s "no active search" meaning (nothing dimmed).
  const matchSet = useMemo(
    () => (matchingOids ? new Set(matchingOids) : null),
    [matchingOids]
  )
  const totalMatches = matchingOids?.length ?? 0

  // Same O(1) lookup set for the AUTHOR column filter — `null` when no author is selected.
  const authorMatchSet = useMemo(
    () => (authorMatchingOids ? new Set(authorMatchingOids) : null),
    [authorMatchingOids]
  )

  // While a ref badge is drag-hovered as a drop target, highlight that ref's *own* lane commits
  // (first-parent attribution — not the shared ancestors below the fork, nor any children) and dim
  // the rest, the same muting the search uses. The sticky hover ref lives in the drag store.
  const dragHoverRef = useRefDragStore((s) => s.hoverRef)
  const dragHighlightSet = useMemo(
    () => collectRefDropHighlight(dragHoverRef, laneRefByOid),
    [dragHoverRef, laneRefByOid]
  )

  // ── Search result navigation (up/down in the floating CommitSearchPanel) ───────────────────
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)
  // Jump back to the first match whenever the query itself changes (find-as-you-type).
  useEffect(() => {
    setActiveMatchIndex(0)
  }, [searchQuery])
  const clampedMatchIndex = totalMatches === 0 ? 0 : Math.min(activeMatchIndex, totalMatches - 1)
  function goToNextMatch() {
    if (totalMatches === 0) return
    setActiveMatchIndex((i) => (i + 1) % totalMatches)
  }
  function goToPreviousMatch() {
    if (totalMatches === 0) return
    setActiveMatchIndex((i) => (i - 1 + totalMatches) % totalMatches)
  }

  // ── Selection (multiple) hook ───────────────────────────────────────────────
  const { selected, primaryOid, setPrimaryOid, selectSingle, handleRowSelect, clearSelection } =
    useCommitSelection(filteredNodes, onSelectCommit)

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
    if (!primaryOid || primaryOid === 'WIP' || primaryOid === 'CONFLICT' || primaryOid.startsWith('WIP:'))
      return null
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
    const isRealCommit =
      !!primaryOid &&
      primaryOid !== 'WIP' &&
      primaryOid !== 'CONFLICT' &&
      !primaryOid.startsWith('WIP:')
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
  const { pendingAction, setPendingAction, openMenuAt, handleCommitWip, openFixupWindow } =
    useGitGraphActions({
      repoPath,
      nodes,
      selected,
      primaryOid,
      setPrimaryOid,
      selectSingle,
      hiddenStashes,
      toggleStashVisibility,
      status,
      isRebasePaused,
      t,
    })

  // Bridge: lets out-of-tree UI (the command palette) trigger a commit-scoped action on the
  // currently selected commit. Dialog-based actions forward into the graph's own `setPendingAction`
  // (which opens the matching dialog against `primaryOid`); `fixup` instead opens the dedicated
  // "Commit Changes" window directly (same as the native menu's `onFixup`), since there's no
  // in-page dialog to route it through. Either way, we clear the pending action once handled.
  useEffect(() => {
    if (pendingGraphAction && primaryOid) {
      if (pendingGraphAction.kind === 'fixup') {
        void openFixupWindow(primaryOid).catch(console.error)
      } else {
        setPendingAction(pendingGraphAction)
      }
      setPendingGraphAction(null)
    }
  }, [pendingGraphAction, primaryOid, setPendingAction, setPendingGraphAction, openFixupWindow])

  // ── Virtualisation ─────────────────────────────────────────────────────────
  const parentRef = useRef<HTMLDivElement>(null)
  const lastScrolledRef = useRef<{ branch: string | undefined; repoPath: string }>({
    branch: undefined,
    repoPath: '',
  })

  const virtualizer = useVirtualizer({
    count: filteredNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 20,
  })

  // Select and scroll the currently focused search match into view — as if it had been clicked —
  // whenever the up/down navigation (or a fresh query) moves it.
  useEffect(() => {
    if (!matchingOids || matchingOids.length === 0) return
    const oid = matchingOids[clampedMatchIndex]
    selectSingle(oid)
    const index = filteredNodes.findIndex((n) => n.commit.oid === oid)
    if (index !== -1) {
      virtualizer.scrollToIndex(index, { align: 'center' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedMatchIndex, matchingOids])

  // Bridge: lets out-of-tree UI (the command palette's SHA lookup, the toolbar's conflict indicator)
  // select a graph row by OID. A pasted SHA may be abbreviated, so resolve it to a loaded commit by
  // prefix; the synthetic 'WIP'/'CONFLICT' rows pass through untouched. On a hit we select and scroll
  // the row into view, exactly as a click would; a SHA outside the loaded window reports "not found".
  useEffect(() => {
    if (!pendingGraphSelection) return
    const raw = pendingGraphSelection
    const isSynthetic = raw === 'CONFLICT' || raw === 'WIP' || raw.startsWith('WIP:')
    // Wait for the log to load before resolving a real SHA, so a selection dispatched just before
    // the graph mounts isn't dropped against an empty list.
    if (!isSynthetic && filteredNodes.length === 0) return
    setPendingGraphSelection(null)
    const prefix = raw.toLowerCase()
    const target = isSynthetic
      ? raw
      : filteredNodes.find((n) => n.commit.oid.toLowerCase().startsWith(prefix))?.commit.oid
    if (!target) {
      toast.error(t('gitTree.commitNotFound', { sha: raw.slice(0, 12) }))
      return
    }
    selectSingle(target)
    const index = filteredNodes.findIndex((n) => n.commit.oid === target)
    if (index !== -1) virtualizer.scrollToIndex(index, { align: 'center' })
  }, [pendingGraphSelection, filteredNodes, virtualizer, selectSingle, setPendingGraphSelection, t])

  // One-shot guard so the conflict panel auto-opens once per pause (below) without snapping
  // back to the CONFLICT row every time the user navigates away to inspect another commit.
  const autoOpenedConflictRef = useRef(false)
  useEffect(() => {
    if (!isRebasePaused) autoOpenedConflictRef.current = false
  }, [isRebasePaused])

  // Auto-select commit when branch/reference or repository changes
  useEffect(() => {
    if (!nodes || nodes.length === 0) return

    // When a rebase pauses on a conflict, surface the resolution panel automatically by
    // selecting the synthetic CONFLICT row — otherwise the user only sees conflict markers in
    // the diff and no obvious way forward (no Continue/Abort). Done once per pause; while paused
    // we also suppress the branch-head auto-select below so a background refetch can't snap the
    // user off the conflict row (or off a commit they navigated to) mid-resolution.
    if (isRebasePaused && conflictNode) {
      if (!autoOpenedConflictRef.current) {
        autoOpenedConflictRef.current = true
        selectSingle('CONFLICT')
      }
      return
    }

    const currentSelected = branch || primaryOid
    // Find a node that has a ref matching the branch name, or matches by OID (stashes)
    const matchNode =
      nodes.find(
        (node) =>
          node.commit.oid === currentSelected ||
          node.refs.some((r) => r.name === currentSelected || r.shortName === currentSelected)
      ) || nodes[0]

    if (matchNode && matchNode.commit.oid !== 'WIP') {
      selectSingle(matchNode.commit.oid)

      if (
        lastScrolledRef.current.branch !== branch ||
        lastScrolledRef.current.repoPath !== repoPath
      ) {
        lastScrolledRef.current = { branch, repoPath }
        const index = filteredNodes.findIndex((n) => n.commit.oid === matchNode.commit.oid)
        if (index !== -1) {
          setTimeout(() => {
            virtualizer.scrollToIndex(index, { align: 'center' })
          }, 50)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, repoPath, nodes, isRebasePaused, conflictNode])

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
      return (
        selected.has(oid) && oid !== 'WIP' && oid !== 'CONFLICT' && !oid.startsWith('WIP:')
      )
    })
  }, [selected, filteredNodes])
  const isMultiSelect = selectedCommitNodes.length > 1

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
      if (oid === 'WIP' || oid === 'CONFLICT' || oid.startsWith('WIP:')) continue
      set.add(oid)
    }
    return set
  }, [timelinePreviewOpen, timelinePreviewOid, renderNodes])

  const isConflictPanelOpen = primaryNode?.commit.oid === 'CONFLICT'

  function closeConflictPanel() {
    clearSelection()
    setConflictFilePath(null)
  }

  const isSelectedCommitHead = useMemo(() => {
    if (!primaryNode || primaryNode.commit.oid === 'WIP' || primaryNode.commit.oid === 'CONFLICT')
      return false
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
      <div className="flex h-full select-none overflow-hidden">
        {/* Main area: PR view (priority), PR composer, DiffViewCenter, or virtualized table */}
      <div className="relative flex min-w-[280px] flex-1 flex-col overflow-hidden">
        {patchMode ? (
          <PatchWorkspaceCenter repoPath={repoPath} />
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
        ) : (
          <>
            <CommitSearchPanel
              resultCount={totalMatches}
              activeIndex={clampedMatchIndex}
              onPrevious={goToPreviousMatch}
              onNext={goToNextMatch}
            />

            {isLoading && (
              <div className="flex flex-1 items-center justify-center">
                <Spinner className="h-5 w-5 text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">{t('gitTree.loading')}</span>
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

                <div ref={parentRef} className="flex-1 overflow-y-auto overflow-x-hidden">
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

                      return (
                        <div
                          key={virtualItem.key}
                          data-testid={`graph-row-${oid}`}
                          data-selected={oid === primaryOid || selected.has(oid)}
                          data-preview-removed={previewRemoved || undefined}
                          className={`hover:z-graph-row-hover${previewRemoved ? ' bg-destructive/15' : ''}`}
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
                              ? 'transform 300ms ease, opacity 300ms ease'
                              : undefined,
                            overflow: previewRemoved ? 'hidden' : undefined,
                          }}
                        >
                          <GraphRow
                            node={node}
                            columns={visibleColumns}
                            isSelected={selected.has(oid)}
                            isPrimary={oid === primaryOid}
                            onSelect={(e) => handleRowSelect(e, virtualItem.index)}
                            onContextMenu={(e) => openMenuAt(e, oid)}
                            wipStats={wipStats}
                            onCommitWip={handleCommitWip}
                            isFirst={virtualItem.index === 0}
                            conflictInfo={conflictInfo}
                            dimmed={dimmed}
                            worktreeWipStatuses={worktreeWipStatuses}
                            onOpenWorktree={setActiveWorkspacePath}
                            worktreeAgentActivity={worktreeAgentActivity}
                            wipAgentActivity={wipAgentActivity}
                            wipRef={wipRef}
                            laneRef={laneRefByOid.get(oid)}
                            graphMaxColumn={graphMaxColumn}
                          />
                        </div>
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
      </div>

      {/* Side panel: patch workspace (priority), PR files, conflict resolution, or commit details */}
      {patchMode ? (
        <>
          <div
            {...resizeProps}
            className="group relative w-2 shrink-0 cursor-col-resize select-none transition-colors hover:bg-primary/40"
          >
            <div className="absolute inset-y-0 left-0.5 w-px bg-border transition-colors group-hover:bg-primary/60" />
          </div>
          <div
            className="h-full min-w-[350px] shrink-0 overflow-hidden"
            style={{ width: panelWidthState }}
          >
            <PatchWorkspacePanel repoPath={repoPath} />
          </div>
        </>
      ) : activePrNumber != null ? (
        prFilesVisible ? (
          <>
            <div
              {...resizeProps}
              className="group relative w-2 shrink-0 cursor-col-resize select-none transition-colors hover:bg-primary/40"
            >
              <div className="absolute inset-y-0 left-0.5 w-px bg-border transition-colors group-hover:bg-primary/60" />
            </div>
            <div
              className="h-full min-w-[350px] shrink-0 overflow-hidden"
              style={{ width: panelWidthState }}
            >
              <PrFilesPanel repoPath={repoPath} prNumber={activePrNumber} />
            </div>
          </>
        ) : null
      ) : !timelinePreviewOpen && primaryNode ? (
        <>
          {/* Handle de redimensionnement */}
          <div
            {...resizeProps}
            className="group relative w-2 shrink-0 cursor-col-resize select-none transition-colors hover:bg-primary/40"
          >
            <div className="absolute inset-y-0 left-0.5 w-px bg-border transition-colors group-hover:bg-primary/60" />
          </div>
          <div
            className="h-full min-w-[350px] shrink-0 overflow-hidden"
            style={{ width: panelWidthState }}
          >
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
          </div>
        </>
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
      </div>
    </RefDropProvider>
  )
}
