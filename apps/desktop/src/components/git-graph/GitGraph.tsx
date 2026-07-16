import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useTranslation } from '@git-manager/i18n'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Spinner } from '@git-manager/ui'
import { useGitLog } from '../../hooks/useGitLog'
import { useGitStatus } from '../../hooks/useGitStatus'
import { useWorktreeWipStatuses } from '../../hooks/useWorktreeWipStatuses'
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
import { GraphHeader } from './GraphHeader'
import { CommitSearchPanel } from './CommitSearchPanel'
import { CommitDetailsPanel } from './CommitDetailsPanel'
import { DiffViewCenter } from './DiffViewCenter'
import { PrDetailCenter } from './pr/PrDetailCenter'
import { PrComposerCenter } from './pr/PrComposerCenter'
import { PrCreateCenter } from './pr/PrCreateCenter'
import { PrFileDiffCenter } from './pr/PrFileDiffCenter'
import { PrFilesPanel } from './pr/PrFilesPanel'
import { EmptyRepoPanel } from './EmptyRepoPanel'
import { GitGraphOverlayManager } from './components/GitGraphOverlayManager'
import { ConflictResolutionPanel } from './ConflictResolutionPanel'
import { Waterline } from './Waterline'
import { COLUMN_DEFS, COLUMN_ORDER, type ResolvedColumn } from './columns'

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

  const pendingGraphSelection = useRepoUIStore((s) => s.pendingGraphSelection)
  const setPendingGraphSelection = useRepoUIStore((s) => s.setPendingGraphSelection)
  const setSelectedCommitOid = useRepoUIStore((s) => s.setSelectedCommitOid)
  const setSelectedStashIndex = useRepoUIStore((s) => s.setSelectedStashIndex)
  const pendingGraphAction = useRepoUIStore((s) => s.pendingGraphAction)
  const setPendingGraphAction = useRepoUIStore((s) => s.setPendingGraphAction)
  const hiddenStashes = useRepoDataStore((s) => s.hiddenStashes[repoPath]) || EMPTY_ARRAY
  const toggleStashVisibility = useRepoDataStore((s) => s.toggleStashVisibility)

  // ── État de rebase (pour la ligne de conflit synthétique dans le graphe) ────
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

  // WIP status of every OTHER linked worktree with uncommitted changes — lets several "// WIP"
  // rows coexist on different branches at once (see useGitGraphNodes' worktreeWipNodes).
  const { data: worktreeWipStatuses = [] } = useWorktreeWipStatuses(repoPath)
  // Opening a worktree is a view switch, not a new tab — it only sets which path the graph/sidebar
  // render data for (see repoUI.store.ts's `activeWorkspacePath`).
  const setActiveWorkspacePath = useRepoUIStore((s) => s.setActiveWorkspacePath)

  // ── Colonnes ──────────────────────────────────────────────────────────────
  const columnState = useGitGraphColumnsStore((s) => s.columns)
  const visibleColumns: ResolvedColumn[] = useMemo(
    () =>
      COLUMN_ORDER.filter((k) => columnState[k].visible).map((k) => ({
        ...COLUMN_DEFS[k],
        width: columnState[k].width,
      })),
    [columnState]
  )

  const showStashesInGraph = useSettingsStore((s) => s.settings.git.showStashesInGraph ?? true)

  const {
    data: nodes = [],
    isLoading,
    isError,
  } = useGitLog(repoPath, {
    limit: 500,
    branch: branch || undefined,
    showStashes: showStashesInGraph,
    hiddenStashes,
  })

  // ── Dérivation des données du graphe (WIP, conflit, recherche, waterlines) ──
  const { wipNode, conflictNode, filteredNodes, renderNodes, waterlines, matchingOids } =
    useGitGraphNodes(nodes, searchQuery, totalChanges, t, conflictInfo, worktreeWipStatuses)

  // Set for O(1) row-level "does this commit match the active search" lookups (see `dimmed`
  // below) — `null` mirrors `matchingOids`'s "no active search" meaning (nothing dimmed).
  const matchSet = useMemo(
    () => (matchingOids ? new Set(matchingOids) : null),
    [matchingOids]
  )
  const totalMatches = matchingOids?.length ?? 0

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

  // ── Sélection (multiple) hook ──────────────────────────────────────────────
  const { selected, primaryOid, setPrimaryOid, selectSingle, handleRowSelect, clearSelection } =
    useCommitSelection(filteredNodes, onSelectCommit)

  // Bridge: lets components outside GitGraph (e.g. the toolbar's conflict indicator) select
  // the synthetic "CONFLICT" row via the store, since `selectSingle` is local to this component.
  useEffect(() => {
    if (pendingGraphSelection) {
      selectSingle(pendingGraphSelection)
      setPendingGraphSelection(null)
    }
  }, [pendingGraphSelection, selectSingle, setPendingGraphSelection])

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

  // ── Menu contextuel natif (macOS) + dialogs + actions du graphe ───────────
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
    <div className="flex h-full select-none overflow-hidden">
      {/* Zone principale : vue PR (priorité), composer de PR, DiffViewCenter, ou tableau virtualisé */}
      <div className="relative flex min-w-[280px] flex-1 flex-col overflow-hidden">
        {activePrNumber != null ? (
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
                <p className="text-sm text-destructive">Failed to load history</p>
              </div>
            )}

            {!isLoading && !isError && nodes.length === 0 && (
              <EmptyRepoPanel repoPath={repoPath} />
            )}

            {!isLoading && !isError && nodes.length > 0 && (
              <>
                <GraphHeader columns={visibleColumns} />

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

                      return (
                        <div
                          key={virtualItem.key}
                          data-testid={`graph-row-${oid}`}
                          data-selected={oid === primaryOid || selected.has(oid)}
                          className="hover:z-[60]"
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
                            onSelect={(e) => handleRowSelect(e, virtualItem.index)}
                            onContextMenu={(e) => openMenuAt(e, oid)}
                            onOpenMenu={(e) => openMenuAt(e, oid)}
                            totalChanges={totalChanges}
                            onCommitWip={handleCommitWip}
                            isFirst={virtualItem.index === 0}
                            conflictInfo={conflictInfo}
                            dimmed={matchSet !== null && !matchSet.has(oid)}
                            worktreeWipStatuses={worktreeWipStatuses}
                            onOpenWorktree={setActiveWorkspacePath}
                          />
                        </div>
                      )
                    })}

                    {/* Waterlines : overlays plein-largeur sur les frontières, hors flux */}
                    {waterlines.map((wl) => (
                      <div
                        key={wl.id}
                        className="pointer-events-none absolute left-0 z-10 w-full"
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

      {/* Panneau latéral : fichiers de la PR (priorité), résolution de conflits, ou détails du commit */}
      {activePrNumber != null ? (
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
      ) : primaryNode ? (
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

      {/* Overlays (dialogs déclenchés par le menu natif) */}
      <GitGraphOverlayManager
        repoPath={repoPath}
        nodes={nodes}
        primaryOid={primaryOid}
        protectedBranches={protectedBranches}
        pendingAction={pendingAction}
        onClearPendingAction={() => setPendingAction(null)}
      />
    </div>
  )
}
