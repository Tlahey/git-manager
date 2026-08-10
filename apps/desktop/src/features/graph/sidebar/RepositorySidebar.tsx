import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GitBranch, GitRef, GitWorktree, PullRequest, GitStash } from '@git-manager/git-types'
import { useSidebarResize, RAIL_WIDTH } from '../hooks/useSidebarResize'
import { useSidebarRows } from '../hooks/useSidebarRows'
import { useTranslation } from '@git-manager/i18n'
import { usePinnedBranchesStore } from '../../../stores/pinned-branches.store'
import { useSidebarSearchStore } from '../../../stores/sidebarSearch.store'
import { useSoloModeStore } from '../../../stores/soloMode.store'
import { useBranchCheckout } from '../../../hooks/useBranchCheckout'
import { SidebarRail } from './SidebarRail'
import { SidebarResizeHandle } from './SidebarResizeHandle'
import { SidebarSearchHeader } from './SidebarSearchHeader'
import { SidebarSectionList, type SidebarRowHandlers } from './SidebarSectionList'
import { useSidebarDialogs } from './useSidebarDialogs'
import { DEFAULT_PINNED, type SectionKey } from './types'
import type { SectionHeaderActionHandlers } from './sectionHeaderActions.config'
import { useRepoDataStore } from '../../../stores/repoData.store'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { useRepoViewStore } from '../../../stores/repoView.store'
import { BlameHistoryPanel } from '../../../components/diff-viewer/BlameHistoryPanel'
import { shortOid } from '../../../lib/shortOid'
import { useWorktreeWipStatuses } from '../hooks/useWorktreeWipStatuses'
import { useStashMenu } from '../hooks/useStashMenu'
import { SidebarDialogsManager } from './SidebarDialogsManager'
import { useGithubAccount } from '../../../hooks/useGithubAccount'
import { useSidebarIssueMenu } from '../hooks/useSidebarIssueMenu'
import { useSidebarPrMenu } from '../hooks/useSidebarPrMenu'
import { useSavedFilterMenu } from '../hooks/useSavedFilterMenu'
import { useIssueFiltersStore } from '../stores/issueFilters.store'
import { usePrFiltersStore } from '../stores/prFilters.store'
import type { SavedFilter } from '../stores/savedFilters'

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
  const { width, resizeHandleProps } = useSidebarResize()
  /**
   * The shell's panel flag (⌘S, or the toolbar's button). On this view "off" is not *gone*: the
   * sidebar has a reduced form the other two panels don't — a column of section icons carrying
   * their counts — and that is worth more than the 48px it costs. The files and board panels have
   * nothing equivalent to fall back to, so there the same flag hides them outright.
   */
  const isPanelOpen = useRepoViewStore((s) => s.isPanelOpen)
  const togglePanel = useRepoViewStore((s) => s.togglePanel)
  const [branchQuery, setBranchQuery] = useState('')
  const isFilterActive = branchQuery.trim().length > 0

  const activeLeftPanel = useRepoUIStore((s) => s.activeLeftPanel)
  const activeDiffFile = useRepoUIStore((s) => s.activeDiffFile)
  const setActiveLeftPanel = useRepoUIStore((s) => s.setActiveLeftPanel)
  const setPrCreateOpen = useRepoUIStore((s) => s.setPrCreateOpen)
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

  // Every dialog the headers and rows can raise — state and openers both (see `useSidebarDialogs`).
  const dialogs = useSidebarDialogs()
  // Destructured because the two menu hooks below keep these in their own dependency lists, and a
  // property read off `dialogs.open` is a fresh expression on every render as far as the linter is
  // concerned. The openers themselves are memoized in the hook.
  const { addWorktree: openAddWorktreeDialog, savedFilter: openSavedFilterDialog } = dialogs.open

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
    onCreateWorktree: openAddWorktreeDialog,
  })
  const openIssueFilterMenu = useSavedFilterMenu(
    useIssueFiltersStore,
    useCallback(
      (filter: SavedFilter) => openSavedFilterDialog('issues', filter),
      [openSavedFilterDialog]
    )
  )
  const openPrFilterMenu = useSavedFilterMenu(
    usePrFiltersStore,
    useCallback(
      (filter: SavedFilter) => openSavedFilterDialog('prs', filter),
      [openSavedFilterDialog]
    )
  )

  // The same menu the graph's stash rows open — see `useStashMenu`. Unlike the graph, a right-click
  // here does not move the selection; only renaming needs the row selected.
  const openStashMenu = useStashMenu({
    repoPath,
    hiddenStashes,
    selectRow: onSelectBranch,
    toggleStashVisibility,
    t,
  })
  const handleStashContextMenu = (_e: React.MouseEvent, stash: GitStash) =>
    openStashMenu(stash.commitOid, stash.index)

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

  // Which section to scroll into view once it opens — opening one isn't enough to see it, since
  // other open sections can push it below the fold.
  const [sectionToReveal, setSectionToReveal] = useState<SectionKey | null>(null)

  // A rail icon stands for a section, so clicking it reopens the sidebar *and* opens that section,
  // rather than dropping the user back on whatever was open before. Sections default to closed, so
  // without this the click answered "here is the sidebar again" and not "here are your tags".
  const openSectionFromRail = useCallback(
    (key: SectionKey) => {
      togglePanel()
      setOpenState((prev) => ({ ...prev, [`section:${key}`]: true }))
      setSectionToReveal(key)
    },
    [togglePanel]
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
    onCreateBranch: onCreateBranch ?? dialogs.open.createBranch,
    onPruneBranches: dialogs.open.pruneBranches,
    onRemoveMergedBranches: () => dialogs.open.removeMergedBranches('all'),
    onRemoveMyMergedBranches: () => dialogs.open.removeMergedBranches('mine'),
    // `null`: the section header's "+" has no branch in mind, so the dialog falls back to the
    // current one — unlike the PR menu's own entry, which names the PR's head branch.
    onAddWorktree: () => dialogs.open.addWorktree(null),
    onPruneWorktrees: dialogs.open.pruneWorktrees,
    onRemoveMergedWorktrees: () => dialogs.open.removeMergedWorktrees('all'),
    onRemoveMyMergedWorktrees: () => dialogs.open.removeMergedWorktrees('mine'),
    onCreatePr: githubConnected ? () => setPrCreateOpen(true) : undefined,
    onCreateIssue: githubConnected ? dialogs.open.createIssue : undefined,
    onAddIssueFilter: githubConnected ? () => dialogs.open.savedFilter('issues', null) : undefined,
    onAddPrFilter: githubConnected ? () => dialogs.open.savedFilter('prs', null) : undefined,
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

  // Every row prop that is the same for every row on the panel, assembled once. The list is long
  // because a sidebar row can be a branch, a tag, a stash, a worktree, a PR or an issue, and each
  // kind brings its own gestures — but none of it varies per row, which is why it travels as one
  // object rather than twenty-five lines of JSX repeated inside the map.
  const rowHandlers: SidebarRowHandlers = {
    repoPath,
    filterQuery: branchQuery,
    soloActive,
    soloed,
    onToggleSolo: toggleSolo,
    onSelectBranch,
    onFocusBranch: focusBranch,
    onCheckoutBranch: checkoutBranch,
    onSelectTag,
    onTogglePin,
    onContextMenu,
    onRemoteBranchContextMenu,
    onOpenPr,
    onPrContextMenu: openPrMenu,
    onIssueContextMenu: openIssueMenu,
    onOpenIssue: setActiveIssue,
    onStashContextMenu: handleStashContextMenu,
    hiddenStashes,
    onToggleStashVisibility: (oid) => toggleStashVisibility(repoPath, oid),
    onTagContextMenu,
    hiddenTags,
    onToggleTagVisibility: (name) => toggleTagVisibility(repoPath, name),
    hiddenBranches,
    onToggleBranchesVisibility: (names, hidden) => setBranchesHidden(repoPath, names, hidden),
    onRemoveWorktree: (wt) => dialogs.open.removeWorktree(wt, false),
    onRemoveWorktreeAndBranch: (wt) => dialogs.open.removeWorktree(wt, true),
    onOpenWorktree: handleOpenWorktree,
    worktreeWipStatuses,
  }

  // ── Focus shortcut (⌥⌘F) ────────────────────────────────────────────
  const focusToken = useSidebarSearchStore((s) => s.focusToken)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const isBlameOrHistoryActive = activeLeftPanel === 'blame' || activeLeftPanel === 'history'

  useEffect(() => {
    if (focusToken === 0) return
    // Reveal the filter input first if it is behind the reduced rail or the blame/history panel —
    // this effect re-runs once that state change lands, then falls through to focus() below.
    if (!isPanelOpen) {
      togglePanel()
      return
    }
    if (isBlameOrHistoryActive) {
      setActiveLeftPanel('sidebar')
      return
    }
    searchInputRef.current?.focus()
    searchInputRef.current?.select()
  }, [focusToken, isPanelOpen, togglePanel, isBlameOrHistoryActive, setActiveLeftPanel])

  // ── Blame / History panel overlay ──────────────────────────────────
  if (isBlameOrHistoryActive) {
    return (
      <div
        data-testid="repository-sidebar"
        className="relative flex h-full shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar"
        style={{ width }}
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

  // ── Reduced mode: the section icons alone ──────────────────────────
  if (!isPanelOpen) {
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
          onOpenSection={openSectionFromRail}
        />
      </div>
    )
  }

  // ── Full mode ──────────────────────────────────────────────────────
  return (
    <div
      data-testid="repository-sidebar"
      className="relative flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
      style={{ width }}
    >
      <SidebarSearchHeader
        query={branchQuery}
        onQueryChange={setBranchQuery}
        filterStats={filterStats}
        soloActive={soloActive}
        soloCount={soloCount}
        onToggleSolo={onToggleSoloMode}
        onClearSolo={clearSolo}
        inputRef={searchInputRef}
      />

      <SidebarSectionList
        sections={sections}
        openById={openById}
        onToggleOpen={toggleOpen}
        sectionToReveal={sectionToReveal}
        revealSectionRef={revealSectionRef}
        isFiltered={isFilterActive}
        sectionHeaderActions={sectionHeaderActionHandlers}
        rowHandlers={rowHandlers}
        onPrFilterMenu={openPrFilterMenu}
        onIssueFilterMenu={openIssueFilterMenu}
      />

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
        createBranchOid={createBranchOid}
        createBranchShortOid={createBranchShortOid}
        {...dialogs.state}
      />
    </div>
  )
}
