import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from '@git-manager/i18n'
import type { GitBranch, GitRef, GitSubmodule, GitWorktree } from '@git-manager/git-types'
import type { WorktreeTerminalSummary } from '../lib/worktreeTerminals'
import { useBranches } from '../../../hooks/useBranches'
import { useGitStashes } from '../../../hooks/useGitStashes'
import { usePullRequests } from '../../../hooks/usePullRequests'
import { useRepoIssues } from './useRepoIssues'
import { useRepoPrFilters } from './useRepoPrFilters'
import { usePinnedBranchesStore } from '../../../stores/pinned-branches.store'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { useIssueFiltersStore } from '../stores/issueFilters.store'
import { usePrFiltersStore } from '../stores/prFilters.store'
import { buildPrSection, buildIssueSection } from '../lib/sidebarGithubSections'
import { buildTerminalsSection } from '../lib/sidebarTerminalSection'
import { sortWorktreesByTerminal, summarizeWorktreeTerminals } from '../lib/worktreeTerminals'
import {
  buildLocalSection,
  buildRemotesSection,
  buildTagsSection,
  buildStashesSection,
  buildSubmodulesSection,
  buildWorktreesSection,
  remoteOf,
} from '../lib/sidebarGitSections'
import { apiGetTags, apiListSubmodules } from '../../../api/git.api'
import { apiListWorktrees } from '../../../api/worktree.api'
import { useTerminalStore } from '../../../stores/terminal.store'
import { useTerminalActivity } from '../../../hooks/useTerminalActivity'
import {
  type SidebarSection,
  type SectionKey,
  DEFAULT_SECTION_OPEN,
  DEFAULT_PINNED,
} from '../sidebar/types'

interface UseSidebarRowsParams {
  repoPath: string
  remoteUrls: string[]
  currentUser?: string
  githubAccountId?: string
  selectedBranch: string | null
  filter: string
  /** Explicit open-state overrides (id -> open). */
  openState: Record<string, boolean>
}

interface UseSidebarRowsResult {
  sections: SidebarSection[]
  /** Effective pinned state of a local branch. */
  isPinned: (shortName: string) => boolean
  /** How many entries match the active filter vs. the panel's total, all kinds combined — shown
   * above the search box to give an overview of the result. */
  filterStats: { matched: number; total: number }
  /** Worktrees flagged prunable by git (folder gone from disk), unfiltered by search query. */
  prunableWorktrees: GitWorktree[]
  /** Every non-main worktree, unfiltered by search query — the full bulk-action candidate set. */
  worktrees: GitWorktree[]
  /** Every local branch, unfiltered by search query — the bulk merged-branch-prune candidate set. */
  allLocalBranches: GitBranch[]
  /** Live terminal sessions per worktree path — the worktree rows' terminal badge. */
  worktreeTerminals: Map<string, WorktreeTerminalSummary>
  /** Revalidate the repo's issue list — called after creating one from the sidebar. */
  refreshIssues: () => void
}

export function useSidebarRows({
  repoPath,
  remoteUrls,
  currentUser,
  githubAccountId,
  selectedBranch,
  filter,
  openState,
}: UseSidebarRowsParams): UseSidebarRowsResult {
  const { t } = useTranslation('git')
  const { data: allBranches = [] } = useBranches(repoPath)
  const { data: stashes = [] } = useGitStashes(repoPath)
  const overrides = usePinnedBranchesStore((s) => s.overrides[repoPath])
  // A tag row highlights when its commit is the one selected in the graph — clicking a tag scrolls
  // to that commit rather than filtering the log, so selection follows the commit, not `selectedBranch`.
  const selectedCommitOid = useRepoUIStore((s) => s.selectedCommitOid)

  const {
    allPrs,
    isGithub,
    // Whether a GitHub *account* is connected, as opposed to `isGithub`'s "this repo has a GitHub
    // remote". Both sections need the distinction: a repo can be on GitHub while the app is signed
    // out, and that is the case the two used to conflate into a network error.
    isConnected,
    isLoading: prsLoading,
  } = usePullRequests({
    remoteUrls,
    currentUser,
    githubAccountId,
  })

  // The user's saved pull request views — one sub-group each, in this order.
  const prFilters = usePrFiltersStore((s) => s.filters)

  const { groups: prGroups, isLoading: prFiltersLoading } = useRepoPrFilters({
    remoteUrls,
    githubAccountId,
    filters: prFilters,
    knownPrs: allPrs,
  })

  // The user's saved issue views — one sub-group each, in this order.
  const issueFilters = useIssueFiltersStore((s) => s.filters)

  const {
    groups: issueGroups,
    allIssues: issues,
    // Its own GitHub-reachability flag, not the pull request hook's: the two resolve the same
    // remote today, but the Issues section must not be at the mercy of whether the PR fetch works.
    isGithub: issuesIsGithub,
    isConnected: issuesIsConnected,
    isLoading: issuesLoading,
    refresh: refreshIssues,
  } = useRepoIssues({ remoteUrls, githubAccountId, filters: issueFilters })

  const { data: tags = [] } = useQuery<GitRef[]>({
    queryKey: ['tags', repoPath],
    queryFn: () => apiGetTags(repoPath),
    enabled: !!repoPath,
    staleTime: 30_000,
  })

  const { data: submodules = [] } = useQuery<GitSubmodule[]>({
    queryKey: ['submodules', repoPath],
    queryFn: () => apiListSubmodules(repoPath),
    enabled: !!repoPath,
    staleTime: 60_000,
  })

  const { data: allWorktrees = [] } = useQuery<GitWorktree[]>({
    queryKey: ['worktrees', repoPath],
    queryFn: () => apiListWorktrees(repoPath),
    enabled: !!repoPath,
    staleTime: 30_000,
  })
  // Detached-HEAD worktrees are hidden — they're typically stale leftovers from a removed
  // branch/worktree (no branch to switch to, can't be merged via PR), so they'd only add noise.
  const worktrees = useMemo(
    () => allWorktrees.filter((wt) => !wt.isMain && wt.branch !== '(detached HEAD)'),
    [allWorktrees]
  )
  // Unfiltered by search query — the section header's prune-button visibility shouldn't
  // depend on whether the sidebar search box happens to currently hide the stale entry.
  const prunableWorktrees = useMemo(() => worktrees.filter((wt) => wt.isPrunable), [worktrees])

  // ── Integrated-terminal sessions ────────────────────────────────────
  // Their own section, and a badge on the worktree rows they belong to. Both read the same two
  // inputs: the session list (a store, so it changes on a user gesture) and the polled busy state.
  const sessions = useTerminalStore((s) => s.sessions)
  const activeTerminalId = useTerminalStore((s) => s.activeId)
  const terminalActivity = useTerminalActivity()
  const worktreeTerminals = useMemo(
    () => summarizeWorktreeTerminals(sessions, terminalActivity),
    [sessions, terminalActivity]
  )

  const q = filter.trim().toLowerCase()
  const includesQuery = (text: string) => !q || text.toLowerCase().includes(q)
  const matchesFilter = (b: GitBranch) => includesQuery(b.shortName)

  // ── Filtering the non-branch sections — the left panel's search box has to reach all of its
  // content, not just the local/remote branches.
  const matchesPrQuery = (pr: (typeof allPrs)[number]) =>
    includesQuery(pr.title) ||
    includesQuery(pr.headRef) ||
    includesQuery(pr.author) ||
    includesQuery(String(pr.number))

  // The search box narrows *within* each saved filter rather than across a flat list: a filter is a
  // saved view, and a search that emptied one would otherwise look like the filter itself broke.
  const filteredPrGroups = useMemo(
    () => prGroups.map((group) => ({ ...group, prs: group.prs.filter(matchesPrQuery) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prGroups, q]
  )

  // De-duplicated across groups — the filters overlap by design, so summing them would over-count
  // the section header and the search stats.
  const filteredPrCount = useMemo(
    () => new Set(filteredPrGroups.flatMap((g) => g.prs.map((p) => p.number))).size,
    [filteredPrGroups]
  )

  // The search box narrows *within* each saved filter rather than across a flat list: a filter is a
  // saved view, and a search that emptied one would otherwise look like the filter itself broke.
  const filteredIssueGroups = useMemo(
    () =>
      issueGroups.map((group) => ({
        ...group,
        issues: group.issues.filter(
          (issue) =>
            includesQuery(issue.title) ||
            includesQuery(issue.author) ||
            includesQuery(String(issue.number)) ||
            issue.labels.some((l) => includesQuery(l))
        ),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [issueGroups, q]
  )

  // De-duplicated across groups — the filters overlap by design, so summing them would over-count
  // the section header and the search stats.
  const filteredIssueCount = useMemo(
    () => new Set(filteredIssueGroups.flatMap((g) => g.issues.map((i) => i.id))).size,
    [filteredIssueGroups]
  )

  const filteredTags = useMemo(
    () =>
      tags
        .filter((tag) => includesQuery(tag.shortName))
        .sort((a, b) =>
          b.shortName.localeCompare(a.shortName, undefined, { numeric: true, sensitivity: 'base' })
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tags, q]
  )

  const filteredStashes = useMemo(
    () => stashes.filter((s) => includesQuery(s.message) || includesQuery(s.branch)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stashes, q]
  )

  const filteredSubmodules = useMemo(
    () => submodules.filter((sm) => includesQuery(sm.path)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [submodules, q]
  )

  // Worktrees with something running float to the top of their section: a list ordered by
  // `git worktree list` is ordered by nothing the user is thinking about, and "where is my agent"
  // is the question this panel is now expected to answer at a glance.
  const filteredWorktrees = useMemo(
    () =>
      sortWorktreesByTerminal(
        worktrees.filter((wt) => includesQuery(wt.branch) || includesQuery(wt.path)),
        worktreeTerminals
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [worktrees, q, worktreeTerminals]
  )

  const isPinned = (shortName: string): boolean =>
    overrides?.[shortName] ?? DEFAULT_PINNED.includes(shortName)

  // ── Local branches (filtered) ──────────────────────────────────────
  const localBranches = useMemo(
    () => allBranches.filter((b) => !b.isRemote && matchesFilter(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allBranches, q]
  )

  // Every local branch, unfiltered by the search box — the prune candidate set.
  const allLocalBranches = useMemo(() => allBranches.filter((b) => !b.isRemote), [allBranches])

  const pinnedBranches = useMemo(
    () =>
      localBranches
        .filter((b) => isPinned(b.shortName))
        .sort((a, b) => {
          const ai = DEFAULT_PINNED.indexOf(a.shortName)
          const bi = DEFAULT_PINNED.indexOf(b.shortName)
          if (ai !== -1 || bi !== -1) {
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
          }
          return a.shortName.localeCompare(b.shortName)
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [localBranches, overrides]
  )

  const remainingBranches = useMemo(
    () => localBranches.filter((b) => !isPinned(b.shortName)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [localBranches, overrides]
  )

  // ── Remote branches (filtered + grouped by remote) ─────────────────
  const remoteGroups = useMemo(() => {
    const map = new Map<string, GitBranch[]>()
    for (const b of allBranches) {
      if (!b.isRemote || !matchesFilter(b)) continue
      const remoteName = remoteOf(b)
      const arr = map.get(remoteName) ?? []
      arr.push(b)
      map.set(remoteName, arr)
    }
    return Array.from(map.entries())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allBranches, q])
  const remoteCount = remoteGroups.reduce((n, [, bs]) => n + bs.length, 0)

  // ── Building each section ───────────────────────────────────────────
  // The order the sections appear in is this list's order, and it is the only thing about them the
  // hook still decides — each builder lives in `lib/sidebarGitSections.ts` (git) or
  // `lib/sidebarGithubSections.ts` (GitHub), and returns `null` when it has nothing to show.
  const sections = useMemo(() => {
    const sectionOpen = (key: SectionKey) =>
      openState[`section:${key}`] ?? DEFAULT_SECTION_OPEN[key]
    const subOpen = (id: string, def = true) => openState[id] ?? def
    const isSelected = (b: GitBranch) => selectedBranch === b.shortName || selectedBranch === b.name
    const ctx = (key: SectionKey) => ({ t, q, isOpen: sectionOpen(key), subOpen })

    return [
      buildLocalSection(ctx('local'), {
        pinnedBranches,
        remainingBranches,
        count: localBranches.length,
        isSelected,
      }),
      buildRemotesSection(ctx('remotes'), {
        groups: remoteGroups,
        count: remoteCount,
        isSelected,
      }),
      buildPrSection(ctx('prs'), {
        groups: filteredPrGroups,
        count: filteredPrCount,
        isGithub,
        isConnected,
        loading: prsLoading || prFiltersLoading,
        selectedBranch,
      }),
      buildIssueSection(ctx('issues'), {
        groups: filteredIssueGroups,
        count: filteredIssueCount,
        isGithub: issuesIsGithub,
        isConnected: issuesIsConnected,
        loading: issuesLoading,
      }),
      buildTagsSection(ctx('tags'), { tags: filteredTags, selectedCommitOid }),
      buildStashesSection(ctx('stashes'), { stashes: filteredStashes, selectedBranch }),
      buildSubmodulesSection(ctx('submodules'), { submodules: filteredSubmodules }),
      buildWorktreesSection(ctx('worktrees'), { worktrees: filteredWorktrees }),
      buildTerminalsSection(ctx('terminals'), {
        sessions,
        activity: terminalActivity,
        worktrees: allWorktrees,
        repoPath,
        activeId: activeTerminalId,
      }),
    ].filter((s): s is SidebarSection => s !== null)
  }, [
    q,
    t,
    openState,
    selectedBranch,
    selectedCommitOid,
    localBranches.length,
    pinnedBranches,
    remainingBranches,
    remoteGroups,
    remoteCount,
    filteredPrGroups,
    filteredPrCount,
    isGithub,
    isConnected,
    prsLoading,
    prFiltersLoading,
    filteredIssueGroups,
    filteredIssueCount,
    issuesIsGithub,
    issuesIsConnected,
    issuesLoading,
    filteredTags,
    filteredStashes,
    filteredSubmodules,
    filteredWorktrees,
    sessions,
    terminalActivity,
    allWorktrees,
    repoPath,
    activeTerminalId,
  ])

  const filterStats = useMemo(
    () => ({
      matched:
        localBranches.length +
        remoteCount +
        filteredPrCount +
        filteredIssueCount +
        filteredTags.length +
        filteredStashes.length +
        filteredSubmodules.length +
        filteredWorktrees.length,
      total:
        allBranches.length +
        allPrs.length +
        issues.length +
        tags.length +
        stashes.length +
        submodules.length +
        worktrees.length,
    }),
    [
      localBranches.length,
      remoteCount,
      filteredPrCount,
      filteredIssueCount,
      filteredTags,
      filteredStashes,
      filteredSubmodules,
      filteredWorktrees,
      allBranches.length,
      allPrs.length,
      issues.length,
      tags.length,
      stashes.length,
      submodules.length,
      worktrees.length,
    ]
  )

  return {
    sections,
    isPinned,
    filterStats,
    prunableWorktrees,
    worktrees,
    allLocalBranches,
    worktreeTerminals,
    refreshIssues,
  }
}
