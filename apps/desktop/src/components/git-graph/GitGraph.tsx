import { useEffect, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useTranslation } from '@git-manager/i18n'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Spinner } from '@git-manager/ui'
import { useGitLog } from '../../hooks/useGitLog'
import { useGitStatus } from '../../hooks/useGitStatus'
import { useGitGraphColumnsStore } from '../../stores/gitGraphColumns.store'

import { useSettingsStore } from '../../stores/settings.store'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useCommitSelection } from '../../hooks/useCommitSelection'
import { useCommitDetailsResize } from '../../hooks/useCommitDetailsResize'
import { useGitGraphNodes, type ConflictRowInfo } from '../../hooks/useGitGraphNodes'
import { useGitGraphActions } from '../../hooks/useGitGraphActions'
import { apiGetRebaseState } from '../../api/git.api'
import { GraphRow } from './GraphRow'
import { GraphHeader } from './GraphHeader'
import { CommitDetailsPanel } from './CommitDetailsPanel'
import { DiffViewCenter } from './DiffViewCenter'
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
  const protectedBranches = useSettingsStore((s) => s.settings.git.protectedBranches)
  const rowHeightSetting = useSettingsStore((s) => s.settings.appearance.rowHeight || 'standard')
  const rowHeight = rowHeightSetting === 'small' ? 32 : 40
  // Current HEAD branch name from repo cache (e.g. "main", "feat/xyz")
  const headBranchName = useRepoDataStore((s) => s.repoCache[repoPath]?.head)

  // ── Sizing / Resizing details panel hook ───────────────────────────────────
  const { width: panelWidthState, resizeProps } = useCommitDetailsResize(400)

  const activeDiffFile = useRepoUIStore((s) => s.activeDiffFile)
  const setActiveDiffFile = useRepoUIStore((s) => s.setActiveDiffFile)
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

  // ── Colonnes ──────────────────────────────────────────────────────────────
  const columnState = useGitGraphColumnsStore((s) => s.columns)
  const visibleColumns: ResolvedColumn[] = useMemo(
    () =>
      COLUMN_ORDER.filter((k) => columnState[k].visible).map((k) => ({
        ...COLUMN_DEFS[k],
        width: columnState[k].width,
      })),
    [columnState],
  )

  const showStashesInGraph = useSettingsStore((s) => s.settings.git.showStashesInGraph ?? true)

  const { data: nodes = [], isLoading, isError } = useGitLog(repoPath, {
    limit: 500,
    branch: branch || undefined,
    showStashes: showStashesInGraph,
    hiddenStashes,
  })

  // ── Dérivation des données du graphe (WIP, conflit, recherche, waterlines) ──
  const { wipNode, conflictNode, filteredNodes, renderNodes, waterlines } = useGitGraphNodes(
    nodes,
    searchQuery,
    totalChanges,
    t,
    conflictInfo,
  )

  // ── Sélection (multiple) hook ──────────────────────────────────────────────
  const {
    selected,
    primaryOid,
    setPrimaryOid,
    selectSingle,
    handleRowSelect,
    clearSelection,
  } = useCommitSelection(filteredNodes, onSelectCommit)

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

  // ── Menu contextuel natif (macOS) + dialogs + actions du graphe ───────────
  const { pendingAction, setPendingAction, toast, openMenuAt, handleCommitWip } = useGitGraphActions({
    repoPath,
    nodes,
    selected,
    primaryOid,
    setPrimaryOid,
    selectSingle,
    hiddenStashes,
    toggleStashVisibility,
    status,
    t,
  })

  // ── Virtualisation ─────────────────────────────────────────────────────────
  const parentRef = useRef<HTMLDivElement>(null)
  const lastScrolledRef = useRef<{ branch: string | undefined; repoPath: string }>({ branch: undefined, repoPath: '' })

  const virtualizer = useVirtualizer({
    count: filteredNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 20,
  })

  // Auto-select commit when branch/reference or repository changes
  useEffect(() => {
    if (!nodes || nodes.length === 0) return

    const currentSelected = branch || primaryOid
    // Find a node that has a ref matching the branch name, or matches by OID (stashes)
    const matchNode = nodes.find((node) =>
      node.commit.oid === currentSelected ||
      node.refs.some((r) => r.name === currentSelected || r.shortName === currentSelected)
    ) || nodes[0]

    if (matchNode && matchNode.commit.oid !== 'WIP') {
      selectSingle(matchNode.commit.oid)

      if (lastScrolledRef.current.branch !== branch || lastScrolledRef.current.repoPath !== repoPath) {
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
  }, [branch, repoPath, nodes])

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
    if (!primaryNode || primaryNode.commit.oid === 'WIP' || primaryNode.commit.oid === 'CONFLICT') return false
    // Strategy 1: a ref with type 'HEAD' is directly on this commit (detached HEAD)
    const hasHeadRef = primaryNode.refs.some((r) => r.type === 'HEAD')
    // Strategy 2: the commit carries the branch that HEAD currently points to
    const hasBranchRef = headBranchName
      ? primaryNode.refs.some(
          (r) => r.type === 'branch' && (r.shortName === headBranchName || r.name === headBranchName),
        )
      : false
    // Strategy 3: fallback – first node in the walk is typically HEAD
    const isFirstNode = primaryNode.commit.oid === nodes[0]?.commit?.oid

    return hasHeadRef || hasBranchRef || isFirstNode
  }, [primaryNode, nodes, headBranchName])

  return (
    <div className="flex h-full overflow-hidden select-none">
      {/* Zone principale : tableau virtualisé ou DiffViewCenter */}
      <div className="flex min-w-[280px] flex-1 flex-col overflow-hidden">
        {activeDiffFile ? (
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
              <div className="flex flex-1 items-center justify-center">
                <p className="text-sm text-muted-foreground">{t('gitTree.noCommits')}</p>
              </div>
            )}

            {!isLoading && !isError && nodes.length > 0 && (
              <>
                <GraphHeader columns={visibleColumns} />

                {filteredNodes.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center">
                    <p className="text-sm text-muted-foreground">{t('gitTree.noResults')}</p>
                  </div>
                ) : (
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
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Panneau latéral : résolution de conflits (priorité) ou détails du commit primaire */}
      {primaryNode && (
        <>
          {/* Handle de redimensionnement */}
          <div
            {...resizeProps}
            className="group relative w-2 shrink-0 cursor-col-resize transition-colors hover:bg-primary/40 select-none"
          >
            <div className="absolute inset-y-0 left-0.5 w-px bg-border transition-colors group-hover:bg-primary/60" />
          </div>
          <div className="h-full shrink-0 overflow-hidden min-w-[350px]" style={{ width: panelWidthState }}>
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
      )}

      {/* Overlays (dialogs déclenchés par le menu natif) */}
      <GitGraphOverlayManager
        repoPath={repoPath}
        nodes={nodes}
        primaryOid={primaryOid}
        protectedBranches={protectedBranches}
        pendingAction={pendingAction}
        onClearPendingAction={() => setPendingAction(null)}
      />

      {/* Toast discret */}
      {toast && (
        <div
          className={`pointer-events-none fixed bottom-4 right-4 z-50 rounded-md border px-3 py-2 text-xs shadow-lg ${
            toast.kind === 'ok'
              ? 'border-border bg-popover text-popover-foreground'
              : 'border-destructive/40 bg-destructive/10 text-destructive'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}
