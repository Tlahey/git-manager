import { useEffect, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useTranslation } from '@git-manager/i18n'
import { useQueryClient } from '@tanstack/react-query'
import { Spinner } from '@git-manager/ui'
import { useGitLog } from '../../hooks/useGitLog'
import { useGitStatus } from '../../hooks/useGitStatus'
import { useGitGraphColumnsStore } from '../../stores/gitGraphColumns.store'

import { useSettingsStore } from '../../stores/settings.store'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { useCommitSelection } from '../../hooks/useCommitSelection'
import { useCommitDetailsResize } from '../../hooks/useCommitDetailsResize'
import { useGitGraphNodes } from '../../hooks/useGitGraphNodes'
import { useGitGraphActions } from '../../hooks/useGitGraphActions'
import { GraphRow } from './GraphRow'
import { GraphHeader } from './GraphHeader'
import { CommitDetailsPanel } from './CommitDetailsPanel'
import { DiffViewCenter } from './DiffViewCenter'
import { GitGraphOverlayManager } from './components/GitGraphOverlayManager'
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
  const hiddenStashes = useRepoDataStore((s) => s.hiddenStashes[repoPath]) || EMPTY_ARRAY
  const toggleStashVisibility = useRepoDataStore((s) => s.toggleStashVisibility)

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

  // ── Dérivation des données du graphe (WIP, recherche, waterlines) ──────────
  const { wipNode, filteredNodes, waterlines, originMainIndex } = useGitGraphNodes(
    nodes,
    searchQuery,
    totalChanges,
    t,
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

  // Reset active diff on commit selection or repo changes
  useEffect(() => {
    setActiveDiffFile(null)
  }, [primaryOid, repoPath])

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
    return nodes.find((n) => n.commit.oid === primaryOid) ?? null
  }, [primaryOid, nodes, wipNode])

  const isSelectedCommitHead = useMemo(() => {
    if (!primaryNode || primaryNode.commit.oid === 'WIP') return false
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
                        const node = filteredNodes[virtualItem.index]
                        const oid = node.commit.oid

                        let nodeToRender = node

                        // 1. Si on est sur le premier commit réel (sous le WIP) et que sa colonne est 0,
                        // on doit ajouter la connexion verticale vers le WIP.
                        if (totalChanges > 0 && virtualItem.index === 1) {
                          if (node.column === 0) {
                            const hasCol0 = node.connections.some((c) => c.fromColumn === 0 && c.toColumn === 0)
                            if (!hasCol0) {
                              nodeToRender = {
                                ...nodeToRender,
                                connections: [
                                  ...nodeToRender.connections,
                                  {
                                    fromColumn: 0,
                                    toColumn: 0,
                                    color: '#7c3aed',
                                    dashed: true,
                                  },
                                ],
                              }
                            }
                          }
                        }

                        // 2. Si le nœud est situé au-dessus ou au niveau du commit origin/main,
                        // on s'assure que toutes ses connexions verticales sur la colonne 0 soient en pointillés.
                        if (originMainIndex !== -1 && virtualItem.index <= originMainIndex) {
                          nodeToRender = {
                            ...nodeToRender,
                            connections: nodeToRender.connections.map((conn) => {
                              if (conn.fromColumn === 0 && conn.toColumn === 0) {
                                return { ...conn, dashed: true }
                              }
                              return conn
                            }),
                          }
                        }

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
                              node={nodeToRender}
                              columns={visibleColumns}
                              isSelected={selected.has(oid)}
                              isPrimary={oid === primaryOid}
                              onSelect={(e) => handleRowSelect(e, virtualItem.index)}
                              onContextMenu={(e) => openMenuAt(e, oid)}
                              onOpenMenu={(e) => openMenuAt(e, oid)}
                              totalChanges={totalChanges}
                              onCommitWip={handleCommitWip}
                              isFirst={virtualItem.index === 0}
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

      {/* Panneau latéral du commit primaire */}
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
            <CommitDetailsPanel
              node={primaryNode}
              repoPath={repoPath}
              isHead={isSelectedCommitHead}
              onSelectCommit={selectSingle}
              onSelectFileDiff={(file) => setActiveDiffFile(file)}
              onClose={clearSelection}
            />
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
