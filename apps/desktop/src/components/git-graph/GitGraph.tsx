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
import { createFixupCommit, createCommit, stageAll } from '../../lib/tauri'
import { GraphRow } from './GraphRow'
import { GraphHeader } from './GraphHeader'
import { CommitPanel } from './CommitPanel'
import { CommitContextMenu } from './CommitContextMenu'
import { CreateBranchHereDialog } from './CreateBranchHereDialog'
import { Waterline } from './Waterline'
import { getWaterlineBucket, bucketLabel } from './waterlineBuckets'
import { RevertDialog } from '../rollback/RevertDialog'
import { ResetDialog } from '../rollback/ResetDialog'
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

  // ── Sélection (multiple) ──────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [primaryOid, setPrimaryOid] = useState<string | null>(null)
  const [anchorOid, setAnchorOid] = useState<string | null>(null)

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
  const [resetOid, setResetOid] = useState<string | null>(null)
  const [revertOid, setRevertOid] = useState<string | null>(null)
  const [branchOid, setBranchOid] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null)

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(id)
  }, [toast])

  // ── Handlers de sélection ──────────────────────────────────────────────────
  function selectSingle(oid: string) {
    setSelected(new Set([oid]))
    setPrimaryOid(oid)
    setAnchorOid(oid)
    onSelectCommit?.(oid)
  }

  function handleRowSelect(e: React.MouseEvent, index: number) {
    const oid = filteredNodes[index].commit.oid
    if (oid === 'WIP') return
    if (e.shiftKey && anchorOid) {
      const fromIndex = filteredNodes.findIndex((n) => n.commit.oid === anchorOid)
      const start = fromIndex === -1 ? index : Math.min(fromIndex, index)
      const end = fromIndex === -1 ? index : Math.max(fromIndex, index)
      const next = new Set<string>()
      for (let i = start; i <= end; i++) next.add(filteredNodes[i].commit.oid)
      setSelected(next)
      setPrimaryOid(oid)
      onSelectCommit?.(oid)
    } else if (e.metaKey || e.ctrlKey) {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(oid)) next.delete(oid)
        else next.add(oid)
        return next
      })
      setPrimaryOid(oid)
      setAnchorOid(oid)
      onSelectCommit?.(oid)
    } else {
      selectSingle(oid)
    }
  }

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
      await createFixupCommit(repoPath, primaryOid)
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
        await stageAll(repoPath)
      }
      await createCommit(repoPath, message)
      queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
    } catch (err) {
      setToast({ kind: 'error', msg: String(err) })
    }
  }

  // ── Virtualisation + resize du panneau de détails ──────────────────────────
  const parentRef = useRef<HTMLDivElement>(null)

  const panelWidth = useRef(400)
  const [panelWidthState, setPanelWidthState] = useState(400)
  const isResizing = useRef(false)
  const resizeStartX = useRef(0)
  const resizeStartWidth = useRef(400)

  function handleResizeStart(e: React.PointerEvent<HTMLDivElement>) {
    isResizing.current = true
    resizeStartX.current = e.clientX
    resizeStartWidth.current = panelWidth.current
  }

  function handleResizeMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isResizing.current) return
    const delta = resizeStartX.current - e.clientX
    const newWidth = Math.max(250, Math.min(700, resizeStartWidth.current + delta))
    panelWidth.current = newWidth
    setPanelWidthState(newWidth)
  }

  function handleResizeEnd() {
    isResizing.current = false
  }

  const virtualizer = useVirtualizer({
    count: filteredNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  })

  const primaryNode = primaryOid
    ? nodes.find((n) => n.commit.oid === primaryOid) ?? null
    : null
  const resetNode = resetOid ? nodes.find((n) => n.commit.oid === resetOid) ?? null : null
  const revertNode = revertOid ? nodes.find((n) => n.commit.oid === revertOid) ?? null : null
  const branchNode = branchOid ? nodes.find((n) => n.commit.oid === branchOid) ?? null : null

  return (
    <div
      className="flex h-full overflow-hidden select-none"
      onPointerMove={handleResizeMove}
      onPointerUp={handleResizeEnd}
      onPointerLeave={handleResizeEnd}
    >
      {/* Zone principale : tableau virtualisé — min-w pour éviter que le panel écrase la liste */}
      <div className="flex min-w-[280px] flex-1 flex-col overflow-hidden">
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
      </div>

      {/* Panneau latéral du commit primaire */}
      {primaryNode && (
        <>
          {/* Handle de redimensionnement — onPointerMove/Up gérés par le container root */}
          <div
            onPointerDown={handleResizeStart}
            className="group relative w-2 shrink-0 cursor-col-resize transition-colors hover:bg-primary/40"
          >
            <div className="absolute inset-y-0 left-0.5 w-px bg-border transition-colors group-hover:bg-primary/60" />
          </div>
          <div className="h-full shrink-0 overflow-hidden" style={{ width: panelWidthState }}>
            <CommitPanel node={primaryNode} repoPath={repoPath} />
          </div>
        </>
      )}

      {/* Menu contextuel d'actions */}
      {menu.isOpen && menu.position && (
        <CommitContextMenu
          position={menu.position}
          menuRef={menu.menuRef}
          targetCount={menuTargets.length}
          onClose={menu.close}
          onReset={() => setResetOid(primaryOid)}
          onRevert={() => setRevertOid(primaryOid)}
          onCreateBranch={() => setBranchOid(primaryOid)}
          onCopySha={handleCopySha}
          onFixup={handleFixup}
        />
      )}

      {/* Dialogs d'actions */}
      {resetNode && (
        <ResetDialog
          repoPath={repoPath}
          targetOid={resetNode.commit.oid}
          targetSubject={resetNode.commit.subject}
          open
          onClose={() => setResetOid(null)}
          onSuccess={() => setResetOid(null)}
          protectedBranches={protectedBranches}
        />
      )}
      {revertNode && (
        <RevertDialog
          repoPath={repoPath}
          commitOid={revertNode.commit.oid}
          commitSubject={revertNode.commit.subject}
          open
          onClose={() => setRevertOid(null)}
          onSuccess={() => setRevertOid(null)}
        />
      )}
      {branchNode && (
        <CreateBranchHereDialog
          repoPath={repoPath}
          oid={branchNode.commit.oid}
          shortOid={branchNode.commit.shortOid}
          open
          onClose={() => setBranchOid(null)}
        />
      )}

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
