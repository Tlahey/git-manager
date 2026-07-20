import { useEffect, useMemo, useRef, useState } from 'react'
import { PanelLeftClose, Search, X } from 'lucide-react'
import { Input } from '@git-manager/ui'
import type { GitBranch, GitWorktree, PullRequest } from '@git-manager/git-types'
import { useSidebarResize, RAIL_WIDTH } from '../../hooks/useSidebarResize'
import { useSidebarRows } from '../../hooks/useSidebarRows'
import { useTranslation } from '@git-manager/i18n'
import { usePinnedBranchesStore } from '../../stores/pinned-branches.store'
import { useSidebarSearchStore } from '../../stores/sidebarSearch.store'
import { SidebarResizeHandle } from './SidebarResizeHandle'
import { SidebarRail } from './SidebarRail'
import { SidebarRowView } from './SidebarRowView'
import { SidebarSectionHeader } from './SidebarSectionHeader'
import { MIN_SECTION_BODY_HEIGHT, MIN_SECTION_HEIGHT, DEFAULT_PINNED } from './types'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { BlameHistoryPanel } from './BlameHistoryPanel'
import { useQueryClient } from '@tanstack/react-query'
import { mutate } from 'swr'
import { showStashNativeContextMenu } from '../../api/nativeMenu.api'
import { apiStashApply, apiStashPop, apiStashDrop } from '../../api/git.api'
import type { GitStash } from '@git-manager/git-types'
import { useWorktreeWipStatuses } from '../../hooks/useWorktreeWipStatuses'
import { AddWorktreeDialog } from './AddWorktreeDialog'
import { RemoveWorktreeDialog } from './RemoveWorktreeDialog'
import { PruneWorktreesDialog } from './PruneWorktreesDialog'
import { RemoveMergedWorktreesDialog } from './RemoveMergedWorktreesDialog'
import { RemoveMergedBranchesDialog } from './RemoveMergedBranchesDialog'
import { PruneBranchesDialog } from './PruneBranchesDialog'
import { CreateBranchHereDialog } from '../git-graph/CreateBranchHereDialog'

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
  const { t } = useTranslation('git')
  const { width, isCollapsed, collapse, expand, resizeHandleProps } = useSidebarResize()
  const [branchQuery, setBranchQuery] = useState('')
  const isFilterActive = branchQuery.trim().length > 0

  const activeLeftPanel = useRepoUIStore((s) => s.activeLeftPanel)
  const activeDiffFile = useRepoUIStore((s) => s.activeDiffFile)
  const setActiveLeftPanel = useRepoUIStore((s) => s.setActiveLeftPanel)
  const setPrCreateOpen = useRepoUIStore((s) => s.setPrCreateOpen)
  const setEditingOid = useRepoUIStore((s) => s.setEditingOid)
  const queryClient = useQueryClient()
  const [openState, setOpenState] = useState<Record<string, boolean>>({})

  const hiddenStashes = useRepoDataStore((s) => s.hiddenStashes[repoPath]) || EMPTY_ARRAY
  const toggleStashVisibility = useRepoDataStore((s) => s.toggleStashVisibility)
  // The repo tab's own path (stable, unlike `repoPath` which may already be a workspace) — used to
  // key the pending-changes bubble so a worktree's own row still shows it while that worktree is
  // the active workspace, and to drive entering a workspace (a view switch, not a new tab).
  const activeRepo = useRepoUIStore((s) => s.activeRepo)
  const setActiveWorkspacePath = useRepoUIStore((s) => s.setActiveWorkspacePath)
  const { data: worktreeWipStatuses = [] } = useWorktreeWipStatuses(activeRepo ?? '')

  function handleOpenWorktree(wt: GitWorktree) {
    setActiveWorkspacePath(wt.path)
  }

  const [addWorktreeOpen, setAddWorktreeOpen] = useState(false)
  const [worktreeToRemove, setWorktreeToRemove] = useState<GitWorktree | null>(null)
  const [pruneWorktreesOpen, setPruneWorktreesOpen] = useState(false)
  // null = closed; 'all' / 'mine' = open, filtered to the current user's merged PRs when 'mine'.
  const [removeMergedWorktrees, setRemoveMergedWorktrees] = useState<null | 'all' | 'mine'>(null)
  const [removeMergedBranches, setRemoveMergedBranches] = useState<null | 'all' | 'mine'>(null)
  const [pruneBranchesOpen, setPruneBranchesOpen] = useState(false)
  const [createBranchOpen, setCreateBranchOpen] = useState(false)

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

  const setPin = usePinnedBranchesStore((s) => s.setPin)
  const overrides = usePinnedBranchesStore((s) => s.overrides[repoPath])

  const {
    sections,
    filterStats,
    prunableWorktrees = [],
    worktrees = [],
    allLocalBranches = [],
  } = useSidebarRows({
    repoPath,
    remoteUrls,
    currentUser,
    githubToken,
    selectedBranch,
    filter: branchQuery,
    openState,
  })

  // New branches from the sidebar "+" are created off the current HEAD commit (or the ref "HEAD"
  // when detached, which the backend still resolves).
  const headBranch = allLocalBranches.find((b) => b.isHead)
  const createBranchOid = headBranch?.commitOid ?? 'HEAD'
  const createBranchShortOid = headBranch ? headBranch.commitOid.slice(0, 7) : 'HEAD'

  const toggleOpen = (id: string, currentlyOpen: boolean) =>
    setOpenState((prev) => ({ ...prev, [id]: !currentlyOpen }))

  const onTogglePin = (shortName: string) => {
    const isPinned = overrides?.[shortName] ?? DEFAULT_PINNED.includes(shortName)
    setPin(repoPath, shortName, !isPinned)
  }

  // Map id -> isOpen pour résoudre l'état courant lors du toggle (sections + sous-groupes
  // repliables imbriqués dans leur corps : dossiers de branches locales, groupes de remotes).
  const openById = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const s of sections) {
      m.set(`section:${s.key}`, s.isOpen)
      for (const r of s.rows) {
        if (r.kind === 'folder' || r.kind === 'remote-group' || r.kind === 'subgroup') {
          m.set(r.id, r.isOpen)
        }
      }
    }
    return m
  }, [sections])

  // ── Focus shortcut (⌥⌘F) ────────────────────────────────────────────
  const focusToken = useSidebarSearchStore((s) => s.focusToken)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const isBlameOrHistoryActive = activeLeftPanel === 'blame' || activeLeftPanel === 'history'

  useEffect(() => {
    if (focusToken === 0) return
    // Reveal the filter input first if it's hidden behind the rail or the blame/history panel —
    // this effect re-runs once that state change lands, then falls through to focus() below.
    if (isCollapsed) {
      expand()
      return
    }
    if (isBlameOrHistoryActive) {
      setActiveLeftPanel('sidebar')
      return
    }
    searchInputRef.current?.focus()
    searchInputRef.current?.select()
  }, [focusToken, isCollapsed, isBlameOrHistoryActive, expand, setActiveLeftPanel])

  // ── Blame / History panel overlay ──────────────────────────────────
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
          title={t('sidebar.collapse')}
          aria-label={t('sidebar.collapse')}
          className="flex h-6 w-6 items-center justify-center rounded text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* Barre de recherche dans les branches */}
      <div className="shrink-0 border-b border-sidebar-border px-2 py-1.5">
        {isFilterActive && (
          <div
            className="mb-1 px-0.5 text-[10px] text-sidebar-muted-foreground"
            data-testid="sidebar-filter-stats"
          >
            <span className="font-semibold text-primary">{filterStats.matched}</span>
            {` / ${filterStats.total} résultats`}
          </div>
        )}
        <Input
          ref={searchInputRef}
          variant="chrome"
          type="text"
          value={branchQuery}
          onChange={(e) => setBranchQuery(e.target.value)}
          placeholder={t('sidebar.filterBranchesPlaceholder')}
          aria-label={t('sidebar.filterBranches')}
          className="h-7 text-xs shadow-none"
          startIcon={<Search className="h-3.5 w-3.5 text-sidebar-muted-foreground" />}
          endIcon={
            branchQuery ? (
              <button
                onClick={() => setBranchQuery('')}
                aria-label={t('sidebar.clearFilter')}
                className="flex h-4 w-4 items-center justify-center rounded text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            ) : undefined
          }
        />
      </div>

      {/* Sections repliables — chaque section ouverte est `flex-1` (poids égal, base 0%) : les
          sections ouvertes se partagent toujours la hauteur disponible à parts strictement
          égales, même une section clairsemée (ex: un seul worktree) — c'est voulu, pour que toutes
          les sections ouvertes s'alignent sur la même hauteur. Chaque section ouverte a un
          plancher (min-height) fixé explicitement en style inline plutôt que de compter sur la
          taille minimale automatique dérivée du contenu (voir le commentaire de
          `MIN_SECTION_HEIGHT` dans types.ts pour le pourquoi — c'est ce qui causait
          l'agrandissement non borné puis le chevauchement des sections suivantes). Si la somme des
          planchers des sections ouvertes dépasse la hauteur du panel, c'est la liste de sections
          entière qui devient scrollable (un seul scrollbar global). Les sections fermées restent
          `flex-none` (ne rétrécissent jamais sous leur en-tête). */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        {sections.map((section) => (
          <div
            key={section.key}
            className={`flex flex-col border-b border-sidebar-border last:border-b-0 ${
              section.isOpen ? 'flex-1' : 'flex-none'
            }`}
            style={section.isOpen ? { minHeight: MIN_SECTION_HEIGHT } : undefined}
            data-testid={`sidebar-section-container-${section.key}`}
          >
            <SidebarSectionHeader
              sectionKey={section.key}
              title={section.title}
              count={section.count}
              isOpen={section.isOpen}
              onToggle={() => toggleOpen(`section:${section.key}`, section.isOpen)}
              onCreateBranch={
                section.key === 'local'
                  ? (onCreateBranch ?? (() => setCreateBranchOpen(true)))
                  : undefined
              }
              onPruneBranches={
                section.key === 'local' ? () => setPruneBranchesOpen(true) : undefined
              }
              onRemoveMergedBranches={
                section.key === 'local' ? () => setRemoveMergedBranches('all') : undefined
              }
              onRemoveMyMergedBranches={
                section.key === 'local' ? () => setRemoveMergedBranches('mine') : undefined
              }
              onAddWorktree={
                section.key === 'worktrees' ? () => setAddWorktreeOpen(true) : undefined
              }
              onPruneWorktrees={
                section.key === 'worktrees' ? () => setPruneWorktreesOpen(true) : undefined
              }
              onRemoveMergedWorktrees={
                section.key === 'worktrees' ? () => setRemoveMergedWorktrees('all') : undefined
              }
              onRemoveMyMergedWorktrees={
                section.key === 'worktrees' ? () => setRemoveMergedWorktrees('mine') : undefined
              }
              onCreatePr={
                section.key === 'prs' && githubToken ? () => setPrCreateOpen(true) : undefined
              }
              isFiltered={isFilterActive}
            />
            {section.isOpen && (
              <div
                className="flex-1 overflow-y-auto"
                style={{ minHeight: MIN_SECTION_BODY_HEIGHT }}
              >
                {section.rows.map((row) => (
                  <SidebarRowView
                    key={row.id}
                    row={row}
                    filterQuery={branchQuery}
                    onToggleOpen={(id) => toggleOpen(id, openById.get(id) ?? false)}
                    onSelectBranch={onSelectBranch}
                    onTogglePin={onTogglePin}
                    onContextMenu={onContextMenu}
                    onOpenPr={onOpenPr}
                    onStashContextMenu={handleStashContextMenu}
                    hiddenStashes={hiddenStashes}
                    onToggleStashVisibility={(oid) => toggleStashVisibility(repoPath, oid)}
                    onRemoveWorktree={(wt) => setWorktreeToRemove(wt)}
                    onOpenWorktree={handleOpenWorktree}
                    worktreeWipStatuses={worktreeWipStatuses}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
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
      <PruneWorktreesDialog
        repoPath={repoPath}
        worktrees={prunableWorktrees}
        open={pruneWorktreesOpen}
        onClose={() => setPruneWorktreesOpen(false)}
      />
      <RemoveMergedWorktreesDialog
        repoPath={repoPath}
        worktrees={worktrees}
        remoteUrls={remoteUrls}
        githubToken={githubToken}
        mineOnly={removeMergedWorktrees === 'mine'}
        currentUser={currentUser}
        open={removeMergedWorktrees !== null}
        onClose={() => setRemoveMergedWorktrees(null)}
      />
      <RemoveMergedBranchesDialog
        repoPath={repoPath}
        branches={allLocalBranches}
        worktreeBranches={worktrees.map((w) => w.branch)}
        remoteUrls={remoteUrls}
        githubToken={githubToken}
        mineOnly={removeMergedBranches === 'mine'}
        currentUser={currentUser}
        open={removeMergedBranches !== null}
        onClose={() => setRemoveMergedBranches(null)}
      />
      <PruneBranchesDialog
        repoPath={repoPath}
        branches={allLocalBranches}
        worktreeBranches={worktrees.map((w) => w.branch)}
        open={pruneBranchesOpen}
        onClose={() => setPruneBranchesOpen(false)}
      />
      <CreateBranchHereDialog
        repoPath={repoPath}
        oid={createBranchOid}
        shortOid={createBranchShortOid}
        open={createBranchOpen}
        onClose={() => setCreateBranchOpen(false)}
      />
    </div>
  )
}
