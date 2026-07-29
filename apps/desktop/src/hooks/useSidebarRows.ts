import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from '@git-manager/i18n'
import type { GitBranch, GitRef, GitSubmodule, GitWorktree } from '@git-manager/git-types'
import { useBranches } from './useBranches'
import { useGitStashes } from './useGitStashes'
import { useGroupedBranches } from './useGroupedBranches'
import { usePullRequests } from './usePullRequests'
import { useRepoIssues } from './useRepoIssues'
import { useRepoPrFilters } from './useRepoPrFilters'
import { useMergedPrsByBranch } from './useMergedPrsByBranch'
import { usePinnedBranchesStore } from '../stores/pinned-branches.store'
import { useRepoUIStore } from '../stores/repoUI.store'
import { issueFilterLabel, useIssueFiltersStore } from '../stores/issueFilters.store'
import { prFilterLabel, usePrFiltersStore } from '../stores/prFilters.store'
import { apiGetTags, apiListSubmodules } from '../api/git.api'
import { apiListWorktrees } from '../api/worktree.api'
import {
  type SidebarRow,
  type SidebarSection,
  type SectionKey,
  DEFAULT_SECTION_OPEN,
  DEFAULT_PINNED,
} from '../components/repository-sidebar/types'

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
    isLoading: prsLoading,
  } = usePullRequests({
    remoteUrls,
    currentUser,
    githubToken,
  })

  // The user's saved pull request views — one sub-group each, in this order.
  const prFilters = usePrFiltersStore((s) => s.filters)

  const {
    groups: prGroups,
    isLoading: prFiltersLoading,
  } = useRepoPrFilters({ remoteUrls, githubToken, filters: prFilters, knownPrs: allPrs })

  // The user's saved issue views — one sub-group each, in this order.
  const issueFilters = useIssueFiltersStore((s) => s.filters)

  const {
    groups: issueGroups,
    allIssues: issues,
    // Its own GitHub-reachability flag, not the pull request hook's: the two resolve the same
    // remote today, but the Issues section must not be at the mercy of whether the PR fetch works.
    isGithub: issuesIsGithub,
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

  // Merged PRs by head branch — `usePullRequests` only fetches open PRs, so a branch/worktree that's
  // already merged has no open PR to match; this fills that gap from the closed-PR list.
  const mergedPrByBranch = useMergedPrsByBranch({ remoteUrls, githubToken })

  // Index PRs by their head branch (unfiltered by the search box — a branch/worktree row shows its
  // PR tag regardless of what's typed). Start from merged PRs, then let open PRs win over a stale
  // merged one sharing a headRef (a reused branch name), so an active PR is never masked.
  const prByBranch = useMemo(() => {
    const map = new Map<string, (typeof allPrs)[number]>(mergedPrByBranch)
    for (const pr of allPrs) {
      if (pr.state === 'open') map.set(pr.headRef, pr)
      else if (!map.has(pr.headRef)) map.set(pr.headRef, pr)
    }
    return map
  }, [allPrs, mergedPrByBranch])

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
    () => tags.filter((tag) => includesQuery(tag.shortName)),
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
  const { groups, ungrouped } = useGroupedBranches(remainingBranches)

  // ── Remote branches (filtered + grouped by remote) ─────────────────
  const remoteGroups = useMemo(() => {
    const map = new Map<string, GitBranch[]>()
    for (const b of allBranches) {
      if (!b.isRemote || !matchesFilter(b)) continue
      const slash = b.shortName.indexOf('/')
      const remoteName = slash > 0 ? b.shortName.slice(0, slash) : 'origin'
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
          pr: prByBranch.get(b.shortName),
        })
      }
      if (pinnedBranches.length > 0 && (ungrouped.length > 0 || groups.length > 0)) {
        localRows.push({ kind: 'divider', id: 'div:pinned' })
      }
      for (const b of ungrouped) {
        localRows.push({
          kind: 'branch',
          id: `local:${b.name}`,
          branch: b,
          displayName: b.shortName,
          depth: 0,
          isSelected: isSelected(b),
          isPinned: false,
          pr: prByBranch.get(b.shortName),
        })
      }
      for (const { prefix, branches } of groups) {
        const fid = `folder:${prefix}`
        const open = subOpen(fid, true)
        localRows.push({
          kind: 'folder',
          id: fid,
          prefix,
          count: branches.length,
          isOpen: open,
          hasHead: branches.some((b) => b.isHead),
        })
        if (open) {
          for (const b of branches) {
            localRows.push({
              kind: 'branch',
              id: `local:${b.name}`,
              branch: b,
              displayName: b.shortName.slice(prefix.length),
              depth: 1,
              isSelected: isSelected(b),
              isPinned: false,
              pr: prByBranch.get(b.shortName),
            })
          }
        }
      }
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
          })
          if (gopen) {
            for (const b of branches) {
              remoteRows.push({
                kind: 'remote-branch',
                id: `remote-branch:${b.name}`,
                branch: b,
                remoteName,
                isSelected: isSelected(b),
              })
            }
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

    // ----- Pull Requests -----
    // Hidden while actively filtering down to zero matches; the "loading"/"connect GitHub" states
    // stay visible regardless of the filter since they aren't about matching, just reachability.
    {
      const open = sectionOpen('prs')
      const prRows: SidebarRow[] = []
      if (open) {
        if (prsLoading || prFiltersLoading) {
          prRows.push({
            kind: 'message',
            id: 'pr:loading',
            text: t('sidebar.prs.loading'),
            loading: true,
          })
        } else if (!isGithub) {
          prRows.push({
            kind: 'message',
            id: 'pr:nogithub',
            text: t('sidebar.prs.noGithub'),
          })
        } else if (filteredPrGroups.length === 0) {
          prRows.push({ kind: 'message', id: 'pr:nofilters', text: t('sidebar.prFilters.none') })
        } else {
          // The user's saved filters, every one of them rendered — empty included: a saved view that
          // vanished when it matched nothing would read as a bug, and its header is the only way
          // back to editing or deleting it.
          filteredPrGroups.forEach((group, index) => {
            const gid = `pr-filter:${group.filter.id}`
            // Only the first saved view is expanded by default: the others are one click away and
            // each costs a screenful in a section that shares the panel's height with the rest.
            const gopen = subOpen(gid, index === 0)
            prRows.push({
              kind: 'subgroup',
              id: gid,
              label: prFilterLabel(group.filter, t),
              count: group.prs.length,
              isOpen: gopen,
              filter: group.filter,
              canMoveUp: index > 0,
              canMoveDown: index < filteredPrGroups.length - 1,
            })
            if (!gopen) return
            if (group.error) {
              // GitHub rejected this one query (a typo'd qualifier, a rate limit) — say so on the
              // group itself rather than leaving it silently empty next to working ones.
              prRows.push({
                kind: 'message',
                id: `${gid}:error`,
                text: t('sidebar.prFilters.queryError', { error: group.error }),
              })
              return
            }
            if (group.prs.length === 0) {
              prRows.push({ kind: 'message', id: `${gid}:empty`, text: t('sidebar.prs.empty') })
              return
            }
            for (const pr of group.prs) {
              prRows.push({
                // The same PR can appear under several filters, so the row id has to carry the
                // filter — ids are React keys and must stay unique across the section.
                kind: 'pr',
                id: `pr:${group.filter.id}:${pr.number}`,
                pr,
                isSelected: !!pr.headRef && selectedBranch === pr.headRef,
                depth: 1,
              })
            }
          })
        }
      }
      const hideForFilter = q && isGithub && !prsLoading && !prFiltersLoading && filteredPrCount === 0
      if (!hideForFilter) {
        list.push({
          key: 'prs',
          title: 'Pull Requests',
          count: filteredPrCount || undefined,
          isOpen: open,
          rows: prRows,
        })
      }
    }

    // ----- Issues -----
    // Mirrors the PR section: the loading / "connect GitHub" states ignore the filter (they aren't
    // about matching), and the section only disappears when a filter matches nothing. It stays
    // visible when the repo simply has no issues, because its header carries the "new issue" action.
    //
    // Unlike the PR section, whose four groups are fixed, the sub-groups here are the user's saved
    // filters (see `stores/issueFilters.store.ts`) — so every one of them is rendered, empty
    // included: a saved view that vanished when it matched nothing would read as a bug, and its
    // header is the only way back to editing or deleting it.
    {
      const open = sectionOpen('issues')
      const issueRows: SidebarRow[] = []
      if (open) {
        if (issuesLoading) {
          issueRows.push({
            kind: 'message',
            id: 'issue:loading',
            text: t('sidebar.issues.loading'),
            loading: true,
          })
        } else if (!issuesIsGithub) {
          issueRows.push({ kind: 'message', id: 'issue:nogithub', text: t('sidebar.issues.noGithub') })
        } else if (filteredIssueGroups.length === 0) {
          issueRows.push({
            kind: 'message',
            id: 'issue:nofilters',
            text: t('sidebar.issueFilters.none'),
          })
        } else {
          filteredIssueGroups.forEach((group, index) => {
            const gid = `issue-filter:${group.filter.id}`
            // Only the first saved view is expanded by default: the others are one click away and
            // each costs a screenful in a section that shares the panel's height with the rest.
            const gopen = subOpen(gid, index === 0)
            issueRows.push({
              kind: 'subgroup',
              id: gid,
              label: issueFilterLabel(group.filter, t),
              count: group.issues.length,
              isOpen: gopen,
              filter: group.filter,
              canMoveUp: index > 0,
              canMoveDown: index < filteredIssueGroups.length - 1,
            })
            if (!gopen) return
            if (group.error) {
              // GitHub rejected this one query (a typo'd qualifier, a rate limit) — say so on the
              // group itself rather than leaving it silently empty next to working ones.
              issueRows.push({
                kind: 'message',
                id: `${gid}:error`,
                text: t('sidebar.issueFilters.queryError', { error: group.error }),
              })
              return
            }
            if (group.issues.length === 0) {
              issueRows.push({ kind: 'message', id: `${gid}:empty`, text: t('sidebar.issues.empty') })
              return
            }
            for (const issue of group.issues) {
              // The same issue can match several filters, so the row id has to carry the filter —
              // ids are React keys and must stay unique across the section.
              issueRows.push({ kind: 'issue', id: `issue:${group.filter.id}:${issue.id}`, issue })
            }
          })
        }
      }
      const hideForFilter = q && issuesIsGithub && !issuesLoading && filteredIssueCount === 0
      if (!hideForFilter) {
        list.push({
          key: 'issues',
          title: 'Issues',
          count: filteredIssueCount || undefined,
          isOpen: open,
          rows: issueRows,
        })
      }
    }

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
            wtRows.push({ kind: 'worktree', id: `wt:${wt.path}`, wt, pr: prByBranch.get(wt.branch) })
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
    ungrouped,
    groups,
    remoteGroups,
    remoteCount,
    filteredPrGroups,
    filteredPrCount,
    prByBranch,
    isGithub,
    prsLoading,
    prFiltersLoading,
    filteredIssueGroups,
    filteredIssueCount,
    issuesIsGithub,
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
