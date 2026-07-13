import { useMemo, useRef, useState } from 'react'
import { PanelLeftClose, Search, X } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { GitBranch, GitWorktree, PullRequest } from '@git-manager/git-types'
import { useSidebarResize, RAIL_WIDTH } from '../../hooks/useSidebarResize'
import { useSidebarRows } from '../../hooks/useSidebarRows'
import { usePinnedBranchesStore } from '../../stores/pinned-branches.store'
import { SidebarResizeHandle } from './SidebarResizeHandle'
import { SidebarRail } from './SidebarRail'
import { SidebarRowView } from './SidebarRowView'
import { ROW_HEIGHT, DEFAULT_PINNED } from './types'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { BlameHistoryPanel } from './BlameHistoryPanel'
import { useQueryClient } from '@tanstack/react-query'
import { mutate } from 'swr'
import { showStashNativeContextMenu } from '../../api/nativeMenu.api'
import { apiStashApply, apiStashPop, apiStashDrop } from '../../api/git.api'
import type { GitStash } from '@git-manager/git-types'
import { AddWorktreeDialog } from './AddWorktreeDialog'
import { RemoveWorktreeDialog } from './RemoveWorktreeDialog'

interface RepositorySidebarProps {
  repoPath: string
  remoteUrls?: string[]
  selectedBranch: string | null
  onSelectBranch: (name: string | null) => void
  currentUser?: string
  githubToken?: string
  onCreateBranch?: () => void
  onContextMenu?: (e: React.MouseEvent, branch: GitBranch) => void
  onOpenPr?: (pr: PullRequest) => void
}

const EMPTY_ARRAY: string[] = []

export function RepositorySidebar({
  repoPath,
  remoteUrls = [],
  selectedBranch,
  onSelectBranch,
  currentUser,
  githubToken,
  onCreateBranch,
  onContextMenu,
  onOpenPr,
}: RepositorySidebarProps) {
  const { width, isCollapsed, collapse, expand, resizeHandleProps } = useSidebarResize()
  const [branchQuery, setBranchQuery] = useState('')

  const activeLeftPanel = useRepoUIStore((s) => s.activeLeftPanel)
  const activeDiffFile = useRepoUIStore((s) => s.activeDiffFile)
  const setActiveLeftPanel = useRepoUIStore((s) => s.setActiveLeftPanel)
  const setEditingOid = useRepoUIStore((s) => s.setEditingOid)
  const queryClient = useQueryClient()
  const [openState, setOpenState] = useState<Record<string, boolean>>({})

  const hiddenStashes = useRepoDataStore((s) => s.hiddenStashes[repoPath]) || EMPTY_ARRAY
  const toggleStashVisibility = useRepoDataStore((s) => s.toggleStashVisibility)

  const [addWorktreeOpen, setAddWorktreeOpen] = useState(false)
  const [worktreeToRemove, setWorktreeToRemove] = useState<GitWorktree | null>(null)

  const handleStashContextMenu = (_e: React.MouseEvent, stash: GitStash) => {
    const isHidden = hiddenStashes.includes(stash.commitOid)
    showStashNativeContextMenu({
      isHidden,
      onApply: async () => {
        try {
          await apiStashApply(repoPath, stash.index)
          mutate(['git-stashes', repoPath])
          queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
          queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
        } catch (err) {
          alert(String(err))
        }
      },
      onPop: async () => {
        try {
          await apiStashPop(repoPath, stash.index)
          mutate(['git-stashes', repoPath])
          queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
          queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
        } catch (err) {
          alert(String(err))
        }
      },
      onDelete: async () => {
        try {
          await apiStashDrop(repoPath, stash.index)
          mutate(['git-stashes', repoPath])
          queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
          queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
        } catch (err) {
          alert(String(err))
        }
      },
      onEditMessage: () => {
        onSelectBranch(stash.commitOid)
        setEditingOid(stash.commitOid)
      },
      onToggleVisibility: () => {
        toggleStashVisibility(repoPath, stash.commitOid)
      },
    }).catch(console.error)
  }

  const scrollRef = useRef<HTMLDivElement>(null)

  const setPin = usePinnedBranchesStore((s) => s.setPin)
  const overrides = usePinnedBranchesStore((s) => s.overrides[repoPath])

  const { rows } = useSidebarRows({
    repoPath,
    remoteUrls,
    currentUser,
    githubToken,
    selectedBranch,
    filter: branchQuery,
    openState,
  })

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => ROW_HEIGHT[rows[index].kind],
    getItemKey: (index) => rows[index].id,
    overscan: 12,
  })

  const toggleOpen = (id: string, currentlyOpen: boolean) =>
    setOpenState((prev) => ({ ...prev, [id]: !currentlyOpen }))

  const onTogglePin = (shortName: string) => {
    const isPinned = overrides?.[shortName] ?? DEFAULT_PINNED.includes(shortName)
    setPin(repoPath, shortName, !isPinned)
  }

  // Map id -> isOpen pour résoudre l'état courant lors du toggle.
  const openById = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const r of rows) {
      if (
        r.kind === 'section' ||
        r.kind === 'folder' ||
        r.kind === 'remote-group' ||
        r.kind === 'subgroup'
      ) {
        m.set(r.id, r.isOpen)
      }
    }
    return m
  }, [rows])

  // ── Blame / History panel overlay ──────────────────────────────────
  const isBlameOrHistoryActive = activeLeftPanel === 'blame' || activeLeftPanel === 'history'

  if (isBlameOrHistoryActive) {
    return (
      <div
        className="relative flex h-full shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar"
        style={{ width: isCollapsed ? 350 : width }}
      >
        <BlameHistoryPanel
          file={activeDiffFile}
          repoPath={repoPath}
          onClose={() => setActiveLeftPanel('sidebar')}
        />
        {/* Handle de resize */}
        <SidebarResizeHandle {...resizeHandleProps} />
      </div>
    )
  }

  // ── Mode rail (collapsed) : icônes uniquement ──────────────────────
  if (isCollapsed) {
    return (
      <div
        className="relative flex h-full shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar"
        style={{ width: RAIL_WIDTH }}
      >
        <SidebarRail
          repoPath={repoPath}
          remoteUrls={remoteUrls}
          currentUser={currentUser}
          githubToken={githubToken}
          onExpand={expand}
        />
      </div>
    )
  }

  // ── Mode déplié : sidebar complète ─────────────────────────────────
  return (
    <div
      className="relative flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
      style={{ width }}
    >
      {/* En-tête sidebar avec bouton collapse */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-sidebar-border px-2">
        <span className="select-none text-[10px] font-bold uppercase tracking-widest text-sidebar-muted-foreground/60">
          Repository
        </span>
        <button
          onClick={collapse}
          title="Réduire la sidebar"
          aria-label="Réduire la sidebar"
          className="flex h-6 w-6 items-center justify-center rounded text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* Barre de recherche dans les branches */}
      <div className="shrink-0 border-b border-sidebar-border px-2 py-1.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sidebar-muted-foreground/60" />
          <input
            type="text"
            value={branchQuery}
            onChange={(e) => setBranchQuery(e.target.value)}
            placeholder="Filtrer les branches…"
            aria-label="Filtrer les branches"
            className="h-7 w-full rounded-md border border-sidebar-border bg-sidebar-accent pl-7 pr-7 text-xs text-sidebar-foreground outline-none transition-colors placeholder:text-sidebar-muted-foreground/60 focus-visible:ring-1 focus-visible:ring-ring"
          />
          {branchQuery && (
            <button
              onClick={() => setBranchQuery('')}
              aria-label="Effacer le filtre"
              className="absolute right-1.5 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Contenu virtualisé (scroll natif requis par react-virtual) */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((vi) => {
            const row = rows[vi.index]
            return (
              <div
                key={row.id}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                <SidebarRowView
                  row={row}
                  onToggleOpen={(id) => toggleOpen(id, openById.get(id) ?? false)}
                  onSelectBranch={onSelectBranch}
                  onTogglePin={onTogglePin}
                  onContextMenu={onContextMenu}
                  onOpenPr={onOpenPr}
                  onCreateBranch={onCreateBranch}
                  onStashContextMenu={handleStashContextMenu}
                  hiddenStashes={hiddenStashes}
                  onToggleStashVisibility={(oid) => toggleStashVisibility(repoPath, oid)}
                  onAddWorktree={() => setAddWorktreeOpen(true)}
                  onRemoveWorktree={(wt) => setWorktreeToRemove(wt)}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* Handle de resize */}
      <SidebarResizeHandle {...resizeHandleProps} />

      <AddWorktreeDialog
        repoPath={repoPath}
        open={addWorktreeOpen}
        onClose={() => setAddWorktreeOpen(false)}
      />
      <RemoveWorktreeDialog
        repoPath={repoPath}
        worktree={worktreeToRemove}
        onClose={() => setWorktreeToRemove(null)}
      />
    </div>
  )
}
