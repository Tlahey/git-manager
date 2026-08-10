import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from '@git-manager/i18n'
import type { GitBranch, GitRef, GitSubmodule, GitWorktree } from '@git-manager/git-types'
import { useBranches } from '../../../hooks/useBranches'
import { useGitStashes } from '../../../hooks/useGitStashes'
import {
  buildBranchTree,
  type BranchTreeFolder,
  type BranchTreeNode,
} from '../../../lib/branchTree'
import { usePullRequests } from '../../../hooks/usePullRequests'
import { useRepoIssues } from './useRepoIssues'
import { useRepoPrFilters } from './useRepoPrFilters'
import { usePinnedBranchesStore } from '../../../stores/pinned-branches.store'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { useIssueFiltersStore } from '../stores/issueFilters.store'
import { usePrFiltersStore } from '../stores/prFilters.store'
import { buildPrSection, buildIssueSection } from '../lib/sidebarGithubSections'
import { apiGetTags, apiListSubmodules } from '../../../api/git.api'
import { apiListWorktrees } from '../../../api/worktree.api'
import {
  type SidebarRow,
  type SidebarSection,
  type SectionKey,
  DEFAULT_SECTION_OPEN,
  DEFAULT_PINNED,
} from '../sidebar/types'

interface UseSidebarRowsParams {
  repoPath: string
  remoteUrls: string[]
  currentUser?: string
  githubToken?: string
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
  /** Revalidate the repo's issue list — called after creating one from the sidebar. */
  refreshIssues: () => void
}

const TAGS_LIMIT = 100

/**
 * The remote a branch belongs to.
 *
 * Read from `name`, never from `shortName`: the backend already strips the remote from the latter
 * (`origin/build/ci` arrives as `name: 'origin/build/ci'`, `shortName: 'build/ci'`), so splitting
 * the short name would name the remote after the branch's first *folder* — which is what put
 * `build` and `feat` beside `origin` instead of inside it.
 */
function remoteOf(branch: GitBranch): string {
  const slash = branch.name.indexOf('/')
  return slash > 0 ? branch.name.slice(0, slash) : 'origin'
}

interface PushBranchTreeParams {
  /** Row list being built, appended to in place. */
  rows: SidebarRow[]
  nodes: BranchTreeNode[]
  /** Row id every folder id below is built from, keeping the two sections' ids apart. */
  parentId: string
  /** Depth the level starts at — 0 in the local section, 1 under a remote node. */
  depth: number
  subOpen: (id: string, def?: boolean) => boolean
  branchRow: (branch: GitBranch, displayName: string, depth: number) => SidebarRow
  folderRow: (node: BranchTreeFolder, id: string, depth: number) => SidebarRow
}

/**
 * Flattens a branch tree into rows, walking it rather than iterating a flat list: folders nest, and
 * a closed one has to take its whole subtree off screen, not just its own leaves. Shared by the
 * local and remote sections, which differ only in the rows they build.
 */
function pushBranchTree({
  rows,
  nodes,
  parentId,
  depth,
  subOpen,
  branchRow,
  folderRow,
}: PushBranchTreeParams): void {
  for (const node of nodes) {
    if (node.kind === 'branch') {
      rows.push(branchRow(node.branch, node.displayName, depth))
      continue
    }
    const id = `${parentId}${parentId.endsWith(':') ? '' : '/'}${node.name}`
    rows.push(folderRow(node, id, depth))
    if (subOpen(id, true)) {
      pushBranchTree({
        rows,
        nodes: node.children,
        parentId: id,
        depth: depth + 1,
        subOpen,
        branchRow,
        folderRow,
      })
    }
  }
}

export function useSidebarRows({
  repoPath,
  remoteUrls,
  currentUser,
  githubToken,
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
    githubToken,
  })

  // The user's saved pull request views — one sub-group each, in this order.
  const prFilters = usePrFiltersStore((s) => s.filters)

  const { groups: prGroups, isLoading: prFiltersLoading } = useRepoPrFilters({
    remoteUrls,
    githubToken,
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
  } = useRepoIssues({ remoteUrls, githubToken, filters: issueFilters })

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

  const filteredWorktrees = useMemo(
    () => worktrees.filter((wt) => includesQuery(wt.branch) || includesQuery(wt.path)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [worktrees, q]
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
  const sections = useMemo(() => {
    const list: SidebarSection[] = []

    const sectionOpen = (key: SectionKey) =>
      openState[`section:${key}`] ?? DEFAULT_SECTION_OPEN[key]
    const subOpen = (id: string, def = true) => openState[id] ?? def

    const isSelected = (b: GitBranch) => selectedBranch === b.shortName || selectedBranch === b.name

    // ----- Local -----
    const localOpen = sectionOpen('local')
    const localRows: SidebarRow[] = []
    if (localOpen) {
      for (const b of pinnedBranches) {
        localRows.push({
          kind: 'branch',
          id: `local:${b.name}`,
          branch: b,
          displayName: b.shortName,
          depth: 0,
          isSelected: isSelected(b),
          isPinned: true,
        })
      }
      if (pinnedBranches.length > 0 && remainingBranches.length > 0) {
        localRows.push({ kind: 'divider', id: 'div:pinned' })
      }
      pushBranchTree({
        rows: localRows,
        nodes: buildBranchTree(remainingBranches, (b) => b.shortName),
        parentId: 'folder:',
        depth: 0,
        subOpen,
        branchRow: (branch, displayName, depth) => ({
          kind: 'branch',
          id: `local:${branch.name}`,
          branch,
          displayName,
          depth,
          isSelected: isSelected(branch),
          isPinned: false,
        }),
        folderRow: (node, id, depth) => ({
          kind: 'folder',
          id,
          name: node.name,
          count: node.branches.length,
          isOpen: subOpen(id, true),
          depth,
          hasHead: node.branches.some((b) => b.isHead),
        }),
      })
    }
    // Hidden entirely when actively filtering down to zero matches — a non-empty repo always has
    // a local section otherwise, so this only ever fires while `q` is set.
    if (!(q && localBranches.length === 0)) {
      list.push({
        key: 'local',
        title: 'Local',
        count: localBranches.length,
        isOpen: localOpen,
        rows: localRows,
      })
    }

    // ----- Remotes -----
    if (remoteGroups.length > 0) {
      const open = sectionOpen('remotes')
      const remoteRows: SidebarRow[] = []
      if (open) {
        for (const [remoteName, branches] of remoteGroups) {
          const gid = `remote:${remoteName}`
          const gopen = subOpen(gid, true)
          remoteRows.push({
            kind: 'remote-group',
            id: gid,
            remoteName,
            count: branches.length,
            isOpen: gopen,
            branchNames: branches.map((b) => b.name),
          })
          if (gopen) {
            pushBranchTree({
              rows: remoteRows,
              // `shortName` already reads relative to the remote (the backend strips it), so it is
              // exactly the name the folders below the remote node are cut from.
              nodes: buildBranchTree(branches, (b) => b.shortName),
              parentId: `remote-folder:${remoteName}`,
              // The remote node itself occupies depth 0, so its own children start one in.
              depth: 1,
              subOpen,
              branchRow: (branch, displayName, depth) => ({
                kind: 'remote-branch',
                id: `remote-branch:${branch.name}`,
                branch,
                remoteName,
                displayName,
                depth,
                isSelected: isSelected(branch),
              }),
              folderRow: (node, id, depth) => ({
                kind: 'folder',
                id,
                name: node.name,
                count: node.branches.length,
                isOpen: subOpen(id, true),
                depth,
                branchNames: node.branches.map((b) => b.name),
              }),
            })
          }
        }
      }
      list.push({
        key: 'remotes',
        title: 'Remotes',
        count: remoteCount,
        isOpen: open,
        rows: remoteRows,
      })
    }

    // ----- Pull Requests / Issues -----
    // The two sections that are GitHub rather than git, and the only ones with reachability states
    // (no GitHub remote, no account, still loading) — see `lib/sidebarGithubSections.ts`.
    const prSection = buildPrSection(
      { t, q, isOpen: sectionOpen('prs'), subOpen },
      {
        groups: filteredPrGroups,
        count: filteredPrCount,
        isGithub,
        isConnected,
        loading: prsLoading || prFiltersLoading,
        selectedBranch,
      }
    )
    if (prSection) list.push(prSection)

    const issueSection = buildIssueSection(
      { t, q, isOpen: sectionOpen('issues'), subOpen },
      {
        groups: filteredIssueGroups,
        count: filteredIssueCount,
        isGithub: issuesIsGithub,
        isConnected: issuesIsConnected,
        loading: issuesLoading,
      }
    )
    if (issueSection) list.push(issueSection)

    // ----- Tags -----
    if (filteredTags.length > 0) {
      const open = sectionOpen('tags')
      const tagRows: SidebarRow[] = []
      if (open) {
        for (const tag of filteredTags.slice(0, TAGS_LIMIT)) {
          tagRows.push({
            kind: 'tag',
            id: `tag:${tag.name}`,
            tag,
            isSelected: !!selectedCommitOid && selectedCommitOid === tag.commitOid,
          })
        }
        if (filteredTags.length > TAGS_LIMIT) {
          tagRows.push({
            kind: 'message',
            id: 'tag:more',
            text: t('sidebar.tags.more', { count: filteredTags.length - TAGS_LIMIT }),
          })
        }
      }
      list.push({
        key: 'tags',
        title: 'Tags',
        count: filteredTags.length,
        isOpen: open,
        rows: tagRows,
      })
    }

    // ----- Stashes -----
    if (filteredStashes.length > 0) {
      const open = sectionOpen('stashes')
      const stashRows: SidebarRow[] = []
      if (open) {
        for (const stash of filteredStashes) {
          stashRows.push({
            kind: 'stash',
            id: `stash:${stash.index}`,
            stash,
            isSelected: selectedBranch === stash.commitOid,
          })
        }
      }
      list.push({
        key: 'stashes',
        title: 'Stashes',
        count: filteredStashes.length,
        isOpen: open,
        rows: stashRows,
      })
    }

    // ----- Submodules -----
    if (filteredSubmodules.length > 0) {
      const open = sectionOpen('submodules')
      const smRows: SidebarRow[] = []
      if (open) {
        for (const sm of filteredSubmodules) {
          smRows.push({ kind: 'submodule', id: `sm:${sm.path}`, sm })
        }
      }
      list.push({
        key: 'submodules',
        title: 'Submodules',
        count: filteredSubmodules.length,
        isOpen: open,
        rows: smRows,
      })
    }

    // ----- Worktrees -----
    // Always shown when unfiltered (unlike Submodules/Tags/Stashes, which hide when empty) — this
    // is the only section whose header carries an "add" action, so it must stay reachable with
    // zero worktrees. It still hides while actively filtering down to zero matches.
    if (!(q && filteredWorktrees.length === 0)) {
      const open = sectionOpen('worktrees')
      const wtRows: SidebarRow[] = []
      if (open) {
        if (filteredWorktrees.length === 0) {
          wtRows.push({ kind: 'message', id: 'wt:empty', text: t('sidebar.worktrees.empty') })
        } else {
          for (const wt of filteredWorktrees) {
            wtRows.push({ kind: 'worktree', id: `wt:${wt.path}`, wt })
          }
        }
      }
      list.push({
        key: 'worktrees',
        title: 'Worktrees',
        count: filteredWorktrees.length || undefined,
        isOpen: open,
        rows: wtRows,
      })
    }

    return list
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
    refreshIssues,
  }
}
