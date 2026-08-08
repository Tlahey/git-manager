import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Focus, PanelLeftClose, Search, X } from 'lucide-react'
import { Input, toast } from '@git-manager/ui'
import type { GitBranch, GitRef, GitWorktree, PullRequest, GitStash } from '@git-manager/git-types'
import { useSidebarResize, RAIL_WIDTH } from '../../hooks/useSidebarResize'
import { useSidebarRows } from '../../hooks/useSidebarRows'
import { useTranslation } from '@git-manager/i18n'
import { usePinnedBranchesStore } from '../../stores/pinned-branches.store'
import { useSidebarSearchStore } from '../../stores/sidebarSearch.store'
import { useSoloModeStore } from '../../stores/soloMode.store'
import { useBranchCheckout } from '../../hooks/useBranchCheckout'
import { SidebarResizeHandle } from './SidebarResizeHandle'
import { SidebarRail } from './SidebarRail'
import { SidebarRowView } from './SidebarRowView'
import { SidebarSectionHeader } from './SidebarSectionHeader'
import {
  MIN_SECTION_BODY_HEIGHT,
  MIN_SECTION_HEIGHT,
  DEFAULT_PINNED,
  type SectionKey,
} from './types'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { BlameHistoryPanel } from './BlameHistoryPanel'
import { useQueryClient } from '@tanstack/react-query'
import { mutate } from 'swr'
import { showNativeMenu } from '../../api/nativeMenu.api'
import { buildStashMenuSpec } from '../../lib/graphContextMenus'
import { shortOid } from '../../lib/shortOid'
import { apiStashApply, apiStashPop, apiStashDrop } from '../../api/git.api'
import { useWorktreeWipStatuses } from '../../hooks/useWorktreeWipStatuses'
import { SidebarDialogsManager } from './SidebarDialogsManager'
import {
  resolveSectionHeaderActions,
  type SectionHeaderActionHandlers,
} from './sectionHeaderActions.config'
import { useGithubAccount } from '../../hooks/useGithubAccount'
import { useSidebarIssueMenu } from '../../hooks/useSidebarIssueMenu'
import { useSidebarPrMenu } from '../../hooks/useSidebarPrMenu'
import { useSavedFilterMenu } from '../../hooks/useSavedFilterMenu'
import { useIssueFiltersStore } from '../../stores/issueFilters.store'
import { usePrFiltersStore } from '../../stores/prFilters.store'
import type { SavedFilter } from '../../stores/savedFilters'

interface RepositorySidebarProps {
  repoPath: string
  remoteUrls?: string[]
  selectedBranch: string | null
  onSelectBranch: (name: string | null) => void
  /** Clicking a tag scrolls to / selects its commit in the graph rather than re-filtering the log. */
  onSelectTag?: (commitOid: string) => void
  currentUser?: string
  githubToken?: string
  onCreateBranch?: () => void
  onContextMenu?: (e: React.MouseEvent, branch: GitBranch) => void
  /** Opens a remote branch row's own (wider) action menu. */
  onRemoteBranchContextMenu?: (e: React.MouseEvent, branch: GitBranch) => void
  /** Opens a tag's action menu — the same one the graph's tag badge uses. */
  onTagContextMenu?: (e: React.MouseEvent, tag: GitRef) => void
  onOpenPr?: (pr: PullRequest) => void
}

const EMPTY_ARRAY: string[] = []

export function RepositorySidebar({
  repoPath,
  remoteUrls = [],
  selectedBranch,
  onSelectBranch,
  onSelectTag,
  currentUser,
  githubToken,
  onCreateBranch,
  onContextMenu,
  onRemoteBranchContextMenu,
  onTagContextMenu,
  onOpenPr,
}: RepositorySidebarProps) {
  const { t } = useTranslation('git')
  // The `githubToken` prop is the caller's own copy of the active account's token; fall back to the
  // account itself so a caller that doesn't pass one still gets the signed-in behaviour.
  const { isConnected } = useGithubAccount()
  const githubConnected = !!githubToken || isConnected
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
  const hiddenTags = useRepoDataStore((s) => s.hiddenTags[repoPath]) || EMPTY_ARRAY
  const toggleTagVisibility = useRepoDataStore((s) => s.toggleTagVisibility)
  const hiddenBranches = useRepoDataStore((s) => s.hiddenBranches[repoPath]) || EMPTY_ARRAY
  const setBranchesHidden = useRepoDataStore((s) => s.setBranchesHidden)
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
  // Branch the worktree dialog opens on when it was raised from a pull request; null for the
  // section header's "+", which falls back to the current branch.
  const [worktreeBranch, setWorktreeBranch] = useState<string | null>(null)
  const [worktreeToRemove, setWorktreeToRemove] = useState<GitWorktree | null>(null)
  // Whether the pending removal should also delete the worktree's branch — the two menu entries
  // share one dialog, which only differs by this flag.
  const [removeWithBranch, setRemoveWithBranch] = useState(false)
  const [pruneWorktreesOpen, setPruneWorktreesOpen] = useState(false)
  // null = closed; 'all' / 'mine' = open, filtered to the current user's merged PRs when 'mine'.
  const [removeMergedWorktrees, setRemoveMergedWorktrees] = useState<null | 'all' | 'mine'>(null)
  const [removeMergedBranches, setRemoveMergedBranches] = useState<null | 'all' | 'mine'>(null)
  const [pruneBranchesOpen, setPruneBranchesOpen] = useState(false)
  const [createBranchOpen, setCreateBranchOpen] = useState(false)
  const [createIssueOpen, setCreateIssueOpen] = useState(false)
  // null = closed. `filter: null` opens the dialog on a new one; `kind` names the list it belongs
  // to. A plain boolean couldn't tell "add" from "edit the first filter", nor issues from PRs.
  const [filterDialog, setFilterDialog] = useState<{
    kind: 'issues' | 'prs'
    filter: SavedFilter | null
  } | null>(null)

  // A branch row's two gestures: one click brings its tip into view in the graph, a double click
  // switches to it. A remote row switches onto its local counterpart, creating it if it doesn't
  // exist yet (see `checkoutRemoteBranchAsLocal`) — the same thing the menu's own Checkout does.
  const setPendingGraphSelection = useRepoUIStore((s) => s.setPendingGraphSelection)
  const { checkoutBranchWithStashPrompt, checkoutRemoteBranchAsLocal } = useBranchCheckout()
  const focusBranch = useCallback(
    (branch: GitBranch) => setPendingGraphSelection(branch.commitOid),
    [setPendingGraphSelection]
  )
  const checkoutBranch = useCallback(
    (branch: GitBranch) => {
      // `name`, not `shortName`: the backend strips the remote prefix from a remote branch's
      // `shortName`, and the remote-qualified name is what identifies the ref to track.
      if (branch.isRemote) void checkoutRemoteBranchAsLocal(repoPath, branch.name)
      else void checkoutBranchWithStashPrompt(repoPath, branch.shortName)
    },
    [checkoutBranchWithStashPrompt, checkoutRemoteBranchAsLocal, repoPath]
  )

  const setActiveIssue = useRepoUIStore((s) => s.setActiveIssue)
  const openIssueMenu = useSidebarIssueMenu(repoPath)
  const openPrMenu = useSidebarPrMenu({
    repoPath,
    onSelectBranch,
    onCreateWorktree: useCallback((branch: string) => {
      setWorktreeBranch(branch)
      setAddWorktreeOpen(true)
    }, []),
  })
  const openIssueFilterMenu = useSavedFilterMenu(
    useIssueFiltersStore,
    useCallback((filter: SavedFilter) => setFilterDialog({ kind: 'issues', filter }), [])
  )
  const openPrFilterMenu = useSavedFilterMenu(
    usePrFiltersStore,
    useCallback((filter: SavedFilter) => setFilterDialog({ kind: 'prs', filter }), [])
  )

  const handleStashContextMenu = (_e: React.MouseEvent, stash: GitStash) => {
    const runStash = async (fn: () => Promise<unknown>) => {
      try {
        await fn()
        mutate(['git-stashes', repoPath])
        queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
        queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
      } catch (err) {
        toast.error(String(err))
      }
    }
    void showNativeMenu(
      buildStashMenuSpec(
        { isHidden: hiddenStashes.includes(stash.commitOid) },
        {
          onApply: () => void runStash(() => apiStashApply(repoPath, stash.index)),
          onPop: () => void runStash(() => apiStashPop(repoPath, stash.index)),
          onDelete: () => void runStash(() => apiStashDrop(repoPath, stash.index)),
          onEditMessage: () => {
            onSelectBranch(stash.commitOid)
            setEditingOid(stash.commitOid)
          },
          onToggleVisibility: () => toggleStashVisibility(repoPath, stash.commitOid),
        },
        t
      )
    ).catch(console.error)
  }

  const setPin = usePinnedBranchesStore((s) => s.setPin)
  const overrides = usePinnedBranchesStore((s) => s.overrides[repoPath])

  // The three `= []` defaults look dead against `useSidebarRows`'s signature — and are, in
  // production. They stay because this component's suites mock the hook with partial return
  // shapes, so the arrays really do arrive `undefined` there; dropping the defaults turns 50
  // tests red on `.map` of undefined. Widen the mocks before removing them.
  /* oxlint-disable typescript/no-useless-default-assignment */
  const {
    sections,
    filterStats,
    prunableWorktrees = [],
    worktrees = [],
    allLocalBranches = [],
    refreshIssues,
  } = useSidebarRows({
    repoPath,
    remoteUrls,
    currentUser,
    githubToken,
    selectedBranch,
    filter: branchQuery,
    openState,
  })
  /* oxlint-enable typescript/no-useless-default-assignment */

  // ── Solo mode (branch-visibility filter) ───────────────────────────────────
  const soloActive = useSoloModeStore((s) => s.active)
  const soloed = useSoloModeStore((s) => s.soloed)
  const soloCount = soloed.size
  const enableSolo = useSoloModeStore((s) => s.enable)
  const disableSolo = useSoloModeStore((s) => s.disable)
  const clearSolo = useSoloModeStore((s) => s.clear)
  const toggleSolo = useSoloModeStore((s) => s.toggle)

  // New branches from the sidebar "+" are created off the current HEAD commit (or the ref "HEAD"
  // when detached, which the backend still resolves).
  const headBranch = allLocalBranches.find((b) => b.isHead)
  const createBranchOid = headBranch?.commitOid ?? 'HEAD'
  const createBranchShortOid = headBranch ? shortOid(headBranch.commitOid) : 'HEAD'

  const toggleOpen = (id: string, currentlyOpen: boolean) =>
    setOpenState((prev) => ({ ...prev, [id]: !currentlyOpen }))

  // ── Expanding from the rail onto one section ───────────────────────────────
  // A rail icon stands for a section, so clicking it reopens the sidebar *and* opens that section,
  // rather than dropping the user back on whatever was open before. Sections default to closed, so
  // without this the click answered "here is the sidebar again" and not "here are your tags".
  // The key is also parked in `sectionToReveal` because opening a section isn't enough to see it:
  // other sections may already be open and push it below the fold, hence the scroll below.
  const [sectionToReveal, setSectionToReveal] = useState<SectionKey | null>(null)

  const openSectionFromRail = useCallback(
    (key: SectionKey) => {
      expand()
      setOpenState((prev) => ({ ...prev, [`section:${key}`]: true }))
      setSectionToReveal(key)
    },
    [expand]
  )

  // Ref attached to the section being revealed only, so it fires on the very render that opens it.
  const revealSectionRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    node.scrollIntoView({ block: 'nearest' })
    setSectionToReveal(null)
  }, [])

  // Every section header action this component can wire, regardless of which section is currently
  // rendering — `resolveSectionHeaderActions` (below, in the JSX) narrows this down to the ones
  // the section actually owns. The GitHub-backed ones stay gated on `githubConnected` here: that's
  // each action's own precondition, not a decision about which section shows it. A saved filter
  // added while signed out could not be resolved, and neither a pull request nor an issue can be
  // opened anonymously — so the whole set goes, rather than offering four dead-ends beside the
  // "connect your account" row the section's body now shows.
  const sectionHeaderActionHandlers: SectionHeaderActionHandlers = {
    onCreateBranch: onCreateBranch ?? (() => setCreateBranchOpen(true)),
    onPruneBranches: () => setPruneBranchesOpen(true),
    onRemoveMergedBranches: () => setRemoveMergedBranches('all'),
    onRemoveMyMergedBranches: () => setRemoveMergedBranches('mine'),
    onAddWorktree: () => {
      setWorktreeBranch(null)
      setAddWorktreeOpen(true)
    },
    onPruneWorktrees: () => setPruneWorktreesOpen(true),
    onRemoveMergedWorktrees: () => setRemoveMergedWorktrees('all'),
    onRemoveMyMergedWorktrees: () => setRemoveMergedWorktrees('mine'),
    onCreatePr: githubConnected ? () => setPrCreateOpen(true) : undefined,
    onCreateIssue: githubConnected ? () => setCreateIssueOpen(true) : undefined,
    onAddIssueFilter: githubConnected
      ? () => setFilterDialog({ kind: 'issues', filter: null })
      : undefined,
    onAddPrFilter: githubConnected
      ? () => setFilterDialog({ kind: 'prs', filter: null })
      : undefined,
  }

  const onTogglePin = (shortName: string) => {
    const isPinned = overrides?.[shortName] ?? DEFAULT_PINNED.includes(shortName)
    setPin(repoPath, shortName, !isPinned)
  }

  // Toggle solo mode. Seed the soloed set with the current HEAD branch (or the selected branch) so
  // the graph isn't blank on entry — "everything hidden except the branch we solo".
  const onToggleSoloMode = () => {
    if (soloActive) disableSolo()
    else enableSolo([headBranch?.shortName ?? selectedBranch])
  }

  // Map id -> isOpen, to resolve the current state when toggling (sections plus the collapsible
  // sub-groups nested in their body: local branch folders, remote groups, issue filters).
  const openById = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const s of sections) {
      m.set(`section:${s.key}`, s.isOpen)
      // Every collapsible row, whatever its kind: `onToggleOpen` flips the state it reads back
      // from here, so a kind missing from this map can only ever be opened — it would report
      // itself closed, and toggling it would set it open again. Keyed on the shape rather than on
      // a list of kinds, which is exactly how the remote folders were left out.
      for (const r of s.rows) {
        if ('isOpen' in r) m.set(r.id, r.isOpen)
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
        data-testid="repository-sidebar"
        className="relative flex h-full shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar"
        style={{ width: isCollapsed ? 350 : width }}
      >
        <BlameHistoryPanel
          file={activeDiffFile}
          repoPath={repoPath}
          onClose={() => setActiveLeftPanel('sidebar')}
        />
        {/* Resize handle */}
        <SidebarResizeHandle {...resizeHandleProps} />
      </div>
    )
  }

  // ── Rail mode (collapsed): icons only ──────────────────────────────
  if (isCollapsed) {
    return (
      <div
        data-testid="repository-sidebar"
        className="relative flex h-full shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar"
        style={{ width: RAIL_WIDTH }}
      >
        <SidebarRail
          repoPath={repoPath}
          remoteUrls={remoteUrls}
          currentUser={currentUser}
          githubToken={githubToken}
          onExpand={expand}
          onOpenSection={openSectionFromRail}
        />
      </div>
    )
  }

  // ── Expanded mode: full sidebar ────────────────────────────────────
  return (
    <div
      data-testid="repository-sidebar"
      className="relative flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
      style={{ width }}
    >
      {/* Sidebar header with the collapse button */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-sidebar-border px-2">
        <span className="select-none text-[10px] font-bold uppercase tracking-widest text-sidebar-muted-foreground/60">
          Repository
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onToggleSoloMode}
            title={soloActive ? t('sidebar.solo.exit') : t('sidebar.solo.enable')}
            aria-label={soloActive ? t('sidebar.solo.exit') : t('sidebar.solo.enable')}
            aria-pressed={soloActive}
            data-testid="sidebar-solo-toggle"
            className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded transition-colors ${
              soloActive
                ? 'bg-primary/15 text-primary hover:bg-primary/25'
                : 'text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground'
            }`}
          >
            <Focus className="h-4 w-4" />
          </button>
          <button
            onClick={collapse}
            title={t('sidebar.collapse')}
            aria-label={t('sidebar.collapse')}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Branch search box — the primary ring signals that solo mode is active */}
      <div className="shrink-0 border-b border-sidebar-border px-2 py-1.5">
        {isFilterActive && (
          <div
            className="mb-1 px-0.5 text-[10px] text-sidebar-muted-foreground"
            data-testid="sidebar-filter-stats"
          >
            <span className="font-semibold text-primary">{filterStats.matched}</span>
            {` / ${t('sidebar.filterResults', { count: filterStats.total })}`}
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
          className={`h-7 text-xs shadow-none ${
            soloActive ? 'ring-1 ring-primary focus-visible:ring-primary' : ''
          }`}
          startIcon={
            // No colour outside solo mode: the field's own graded pair applies (see `Input`'s
            // ICON_CLASSES). `sidebar-muted-foreground` is graded against the sidebar background,
            // not against the `sidebar-accent` fill this icon actually sits on.
            <Search className={`h-3.5 w-3.5 ${soloActive ? 'text-primary' : ''}`} />
          }
          endIcon={
            branchQuery ? (
              <button
                onClick={() => setBranchQuery('')}
                aria-label={t('sidebar.clearFilter')}
                className="flex h-4 w-4 cursor-pointer items-center justify-center rounded text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            ) : undefined
          }
        />
        {soloActive && (
          <div
            className="mt-1.5 flex items-center gap-1.5 rounded bg-primary/10 px-1.5 py-1 text-[10px] text-primary"
            data-testid="sidebar-solo-strip"
          >
            <Focus className="h-3 w-3 shrink-0" />
            <span className="flex-1 truncate font-medium">
              {t('sidebar.solo.active', { count: soloCount })}
            </span>
            <button
              onClick={clearSolo}
              className="flex cursor-pointer items-center gap-0.5 rounded px-1 py-0.5 font-medium transition-colors hover:bg-primary/20"
              data-testid="sidebar-solo-clear"
            >
              <X className="h-2.5 w-2.5" />
              {t('sidebar.solo.clear')}
            </button>
          </div>
        )}
      </div>

      {/* Collapsible sections — every open section is `flex-1` (equal weight, 0% basis): open
          sections always split the available height in strictly equal shares, even a sparse
          section (e.g. a single worktree) — that's intentional, so every open section lines up on
          the same height. Each open section has a floor (min-height) set explicitly via inline
          style rather than relying on the automatic minimum size derived from content (see the
          `MIN_SECTION_HEIGHT` comment in types.ts for why — that's what caused unbounded growth
          and then overlap with the following sections). If the sum of the open sections' floors
          exceeds the panel's height, the whole section list becomes scrollable (a single global
          scrollbar). Closed sections stay `flex-none` (never shrink below their header). */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        {sections.map((section) => (
          <div
            key={section.key}
            ref={section.key === sectionToReveal ? revealSectionRef : undefined}
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
              {...resolveSectionHeaderActions(section.key, sectionHeaderActionHandlers)}
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
                    repoPath={repoPath}
                    filterQuery={branchQuery}
                    soloActive={soloActive}
                    soloed={soloed}
                    onToggleSolo={toggleSolo}
                    onToggleOpen={(id) => toggleOpen(id, openById.get(id) ?? false)}
                    onSelectBranch={onSelectBranch}
                    onFocusBranch={focusBranch}
                    onCheckoutBranch={checkoutBranch}
                    onSelectTag={onSelectTag}
                    onTogglePin={onTogglePin}
                    onContextMenu={onContextMenu}
                    onRemoteBranchContextMenu={onRemoteBranchContextMenu}
                    onOpenPr={onOpenPr}
                    onPrContextMenu={openPrMenu}
                    onIssueContextMenu={openIssueMenu}
                    onOpenIssue={setActiveIssue}
                    onIssueFilterMenu={
                      section.key === 'prs' ? openPrFilterMenu : openIssueFilterMenu
                    }
                    onStashContextMenu={handleStashContextMenu}
                    hiddenStashes={hiddenStashes}
                    onToggleStashVisibility={(oid) => toggleStashVisibility(repoPath, oid)}
                    onTagContextMenu={onTagContextMenu}
                    hiddenTags={hiddenTags}
                    onToggleTagVisibility={(name) => toggleTagVisibility(repoPath, name)}
                    hiddenBranches={hiddenBranches}
                    onToggleBranchesVisibility={(names, hidden) =>
                      setBranchesHidden(repoPath, names, hidden)
                    }
                    onRemoveWorktree={(wt) => {
                      setRemoveWithBranch(false)
                      setWorktreeToRemove(wt)
                    }}
                    onRemoveWorktreeAndBranch={(wt) => {
                      setRemoveWithBranch(true)
                      setWorktreeToRemove(wt)
                    }}
                    onOpenWorktree={handleOpenWorktree}
                    worktreeWipStatuses={worktreeWipStatuses}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Resize handle */}
      <SidebarResizeHandle {...resizeHandleProps} />

      <SidebarDialogsManager
        repoPath={repoPath}
        remoteUrls={remoteUrls}
        currentUser={currentUser}
        githubToken={githubToken}
        worktrees={worktrees}
        prunableWorktrees={prunableWorktrees}
        allLocalBranches={allLocalBranches}
        refreshIssues={refreshIssues}
        addWorktreeOpen={addWorktreeOpen}
        onCloseAddWorktree={() => setAddWorktreeOpen(false)}
        worktreeBranch={worktreeBranch}
        worktreeToRemove={worktreeToRemove}
        onCloseRemoveWorktree={() => setWorktreeToRemove(null)}
        removeWithBranch={removeWithBranch}
        pruneWorktreesOpen={pruneWorktreesOpen}
        onClosePruneWorktrees={() => setPruneWorktreesOpen(false)}
        removeMergedWorktrees={removeMergedWorktrees}
        onCloseRemoveMergedWorktrees={() => setRemoveMergedWorktrees(null)}
        removeMergedBranches={removeMergedBranches}
        onCloseRemoveMergedBranches={() => setRemoveMergedBranches(null)}
        pruneBranchesOpen={pruneBranchesOpen}
        onClosePruneBranches={() => setPruneBranchesOpen(false)}
        createBranchOpen={createBranchOpen}
        onCloseCreateBranch={() => setCreateBranchOpen(false)}
        createBranchOid={createBranchOid}
        createBranchShortOid={createBranchShortOid}
        createIssueOpen={createIssueOpen}
        onCloseCreateIssue={() => setCreateIssueOpen(false)}
        filterDialog={filterDialog}
        onCloseFilterDialog={() => setFilterDialog(null)}
      />
    </div>
  )
}
