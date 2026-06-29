import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useTranslation } from '@git-manager/i18n'
import { useQueryClient } from '@tanstack/react-query'
import { Spinner } from '@git-manager/ui'
import { useGitLog } from '../../hooks/useGitLog'
import { useGitStatus } from '../../hooks/useGitStatus'
import { useContextMenu } from '../../hooks/useContextMenu'
import { useGitGraphColumnsStore } from '../../stores/gitGraphColumns.store'
import { useSettingsStore } from '../../stores/settings.store'
import { useReposStore } from '../../stores/repos.store'
import { useCommitSelection } from '../../hooks/useCommitSelection'
import { useCommitDetailsResize } from '../../hooks/useCommitDetailsResize'
import { apiCreateFixupCommit, apiCreateCommit, apiStageAll } from '../../api/git.api'
import { GraphRow } from './GraphRow'
import { GraphHeader } from './GraphHeader'
import { CommitDetailsPanel } from './CommitDetailsPanel'
import { DiffViewCenter } from './DiffViewCenter'
import { GitGraphOverlayManager } from './components/GitGraphOverlayManager'
import { Waterline } from './Waterline'
import { getWaterlineBucket, bucketLabel } from './waterlineBuckets'
import { COLUMN_DEFS, COLUMN_ORDER, type ResolvedColumn } from './columns'

interface GitGraphProps {
  repoPath: string
  branch?: string
  /** Recherche globale issue de la barre d'actions (Partie 2). */
  searchQuery?: string
  onSelectCommit?: (oid: string) => void
}

const ROW_HEIGHT = 40

interface WaterlineMark {
  id: string
  label: string
  /** Index du commit (frontière) sur lequel l'overlay est positionné. */
  index: number
}

export function GitGraph({ repoPath, branch, searchQuery, onSelectCommit }: GitGraphProps) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const protectedBranches = useSettingsStore((s) => s.settings.git.protectedBranches)
  // Current HEAD branch name from repo cache (e.g. "main", "feat/xyz")
  const headBranchName = useReposStore((s) => s.repoCache[repoPath]?.head)

  // ── Sizing / Resizing details panel hook ───────────────────────────────────
  const { width: panelWidthState, resizeProps } = useCommitDetailsResize(400)

  const activeDiffFile = useReposStore((s) => s.activeDiffFile)
  const setActiveDiffFile = useReposStore((s) => s.setActiveDiffFile)

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

  const { data: nodes = [], isLoading, isError } = useGitLog(repoPath, {
    limit: 500,
    branch: branch || undefined,
  })

  const wipNode = useMemo(() => {
    if (totalChanges === 0 || nodes.length === 0) return null
    const firstNode = nodes[0]
    return {
      commit: {
        oid: 'WIP',
        shortOid: 'WIP',
        message: '',
        subject: '',
        body: '',
        author: {
          name: '',
          email: '',
          timestamp: Date.now() / 1000,
        },
        committer: {
          name: '',
          email: '',
          timestamp: Date.now() / 1000,
        },
        parentOids: [firstNode.commit.oid],
      },
      column: firstNode.column,
      color: firstNode.color,
      connections: [
        {
          fromColumn: firstNode.column,
          toColumn: firstNode.column,
          color: firstNode.color,
          dashed: true,
        },
      ],
      refs: [],
    }
  }, [totalChanges, nodes])

  // ── Filtrage (recherche globale uniquement) ────────────────────────────────
  const filteredNodes = useMemo(() => {
    const search = searchQuery?.trim().toLowerCase() ?? ''
    const baseNodes = wipNode ? [wipNode, ...nodes] : nodes
    if (!search) return baseNodes
    return baseNodes.filter((node) => {
      if (node.commit.oid === 'WIP') {
        return 'wip'.includes(search)
      }
      const { commit } = node
      const haystack = [
        commit.subject,
        commit.body,
        commit.author.name,
        commit.author.email,
        commit.oid,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(search)
    })
  }, [nodes, searchQuery, wipNode])

  // ── Sélection (multiple) hook ──────────────────────────────────────────────
  const {
    selected,
    primaryOid,
    setPrimaryOid,
    selectSingle,
    handleRowSelect,
  } = useCommitSelection(filteredNodes, onSelectCommit)

  // Reset active diff on commit selection or repo changes
  useEffect(() => {
    setActiveDiffFile(null)
  }, [primaryOid, repoPath])

  // ── Waterlines : overlays plein-largeur posés sur la frontière entre groupes ──
  // Elles n'occupent PAS de hauteur (le graphe reste continu derrière). On émet
  // de façon MONOTONE (rang croissant) : un palier n'apparaît qu'en entrant dans
  // une période plus ancienne, jamais en arrière (commits pas toujours triés).
  const waterlines = useMemo<WaterlineMark[]>(() => {
    const out: WaterlineMark[] = []
    let maxRank = -1
    filteredNodes.forEach((node, index) => {
      const bucket = getWaterlineBucket(node.commit.author.timestamp)
      if (bucket.rank > maxRank) {
        if (index > 0) {
          out.push({ id: `wl:${index}:${bucket.key}`, label: bucketLabel(bucket, t), index })
        }
        maxRank = bucket.rank
      }
    })
    return out
  }, [filteredNodes, t])

  // ── Menu contextuel + dialogs ──────────────────────────────────────────────
  const menu = useContextMenu()
  const [menuTargets, setMenuTargets] = useState<string[]>([])
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null)

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(id)
  }, [toast])

  function openMenuAt(e: React.MouseEvent, oid: string) {
    if (oid === 'WIP') return
    e.preventDefault()
    e.stopPropagation()
    let targets: string[]
    if (selected.has(oid)) {
      targets = Array.from(selected)
      setPrimaryOid(oid)
    } else {
      selectSingle(oid)
      targets = [oid]
    }
    setMenuTargets(targets)
    menu.openAt(e.clientX, e.clientY)
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  async function handleCopySha() {
    if (!primaryOid) return
    await navigator.clipboard.writeText(primaryOid)
    setToast({ kind: 'ok', msg: t('gitTree.contextMenu.shaCopied') })
  }

  async function handleFixup() {
    if (!primaryOid) return
    try {
      await apiCreateFixupCommit(repoPath, primaryOid)
      queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['pending-fixups', repoPath] })
      setToast({ kind: 'ok', msg: t('gitTree.contextMenu.fixupCreated') })
    } catch (err) {
      setToast({ kind: 'error', msg: String(err) })
    }
  }

  async function handleCommitWip(message: string) {
    if (!message.trim()) return
    try {
      const stagedCount = status?.staged?.length || 0
      if (stagedCount === 0) {
        await apiStageAll(repoPath)
      }
      await apiCreateCommit(repoPath, message)
      queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
    } catch (err) {
      setToast({ kind: 'error', msg: String(err) })
    }
  }

  // ── Virtualisation ─────────────────────────────────────────────────────────
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: filteredNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  })

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

    const result = hasHeadRef || hasBranchRef || isFirstNode
    console.log('[isSelectedCommitHead]', {
      oid: primaryNode.commit.oid.slice(0, 8),
      headBranchName,
      hasHeadRef,
      hasBranchRef,
      isFirstNode,
      result,
      refs: primaryNode.refs.map((r) => `${r.type}:${r.shortName}`),
      nodes0oid: nodes[0]?.commit?.oid?.slice(0, 8),
    })
    return result
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
                        if (totalChanges > 0 && virtualItem.index === 1) {
                          nodeToRender = {
                            ...node,
                            connections: [
                              ...node.connections,
                              {
                                fromColumn: node.column,
                                toColumn: node.column,
                                color: node.color,
                                dashed: true,
                              },
                            ],
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
                              height: ROW_HEIGHT,
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
                            height: ROW_HEIGHT,
                            transform: `translateY(${wl.index * ROW_HEIGHT - ROW_HEIGHT / 2}px)`,
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
            />
          </div>
        </>
      )}

      {/* Overlays (menus contextuels & dialogs) */}
      <GitGraphOverlayManager
        repoPath={repoPath}
        nodes={nodes}
        primaryOid={primaryOid}
        protectedBranches={protectedBranches}
        menuIsOpen={menu.isOpen}
        menuPosition={menu.position}
        menuRef={menu.menuRef}
        menuTargets={menuTargets}
        menuClose={menu.close}
        onCopySha={handleCopySha}
        onFixup={handleFixup}
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
