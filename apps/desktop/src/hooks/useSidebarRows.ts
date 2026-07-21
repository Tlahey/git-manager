import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { GitBranch, GitRef, GitSubmodule, GitWorktree } from '@git-manager/git-types'
import { useBranches } from './useBranches'
import { useGitStashes } from './useGitStashes'
import { useGroupedBranches } from './useGroupedBranches'
import { usePullRequests } from './usePullRequests'
import { usePinnedBranchesStore } from '../stores/pinned-branches.store'
import { useRepoUIStore } from '../stores/repoUI.store'
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
  /** Overrides explicites d'ouverture (id -> open). */
  openState: Record<string, boolean>
}

interface UseSidebarRowsResult {
  sections: SidebarSection[]
  /** État épinglé effectif d'une branche locale. */
  isPinned: (shortName: string) => boolean
  /** Nombre d'éléments correspondant au filtre actif vs. total du panel, tous types confondus —
   * affiché au-dessus de la barre de recherche pour donner une vue d'ensemble du résultat. */
  filterStats: { matched: number; total: number }
  /** Worktrees flagged prunable by git (folder gone from disk), unfiltered by search query. */
  prunableWorktrees: GitWorktree[]
  /** Every non-main worktree, unfiltered by search query — the full bulk-action candidate set. */
  worktrees: GitWorktree[]
  /** Every local branch, unfiltered by search query — the bulk merged-branch-prune candidate set. */
  allLocalBranches: GitBranch[]
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

  // ── Filtrage des sections non-branches — la barre de recherche du panel gauche doit
  // porter sur l'ensemble de son contenu, pas seulement les branches locales/remotes.
  const filteredPrs = useMemo(
    () =>
      allPrs.filter(
        (pr) =>
          includesQuery(pr.title) ||
          includesQuery(pr.headRef) ||
          includesQuery(pr.author) ||
          includesQuery(String(pr.number))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allPrs, q]
  )

  const filteredTags = useMemo(
    () => tags.filter((t) => includesQuery(t.shortName)),
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

  // ── Branches locales (filtrées) ────────────────────────────────────
  const localBranches = useMemo(
    () => allBranches.filter((b) => !b.isRemote && matchesFilter(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allBranches, q]
  )

  // Toutes les branches locales, non filtrées par la recherche — jeu de candidats du prune.
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

  // ── Branches remotes (filtrées + groupées par remote) ──────────────
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

  // ── Construction par section ────────────────────────────────────────
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
        if (prsLoading) {
          prRows.push({
            kind: 'message',
            id: 'pr:loading',
            text: 'Chargement des PRs…',
            loading: true,
          })
        } else if (!isGithub) {
          prRows.push({
            kind: 'message',
            id: 'pr:nogithub',
            text: 'Connectez un dépôt GitHub pour voir les PRs.',
          })
        } else {
          if (filteredPrs.length === 0) {
            prRows.push({ kind: 'message', id: 'pr:empty', text: 'Aucune PR ouverte.' })
          } else {
            for (const pr of filteredPrs) {
              prRows.push({
                kind: 'pr',
                id: `pr:${pr.number}`,
                pr,
                isSelected: selectedBranch === pr.headRef,
              })
            }
          }
        }
      }
      const hideForFilter = q && isGithub && !prsLoading && filteredPrs.length === 0
      if (!hideForFilter) {
        list.push({
          key: 'prs',
          title: 'Pull Requests',
          count: filteredPrs.length || undefined,
          isOpen: open,
          rows: prRows,
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
            text: `+ ${filteredTags.length - TAGS_LIMIT} autres tags`,
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
          wtRows.push({ kind: 'message', id: 'wt:empty', text: 'No linked worktrees.' })
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
    openState,
    selectedBranch,
    selectedCommitOid,
    localBranches.length,
    pinnedBranches,
    ungrouped,
    groups,
    remoteGroups,
    remoteCount,
    filteredPrs,
    isGithub,
    prsLoading,
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
        filteredPrs.length +
        filteredTags.length +
        filteredStashes.length +
        filteredSubmodules.length +
        filteredWorktrees.length,
      total:
        allBranches.length +
        allPrs.length +
        tags.length +
        stashes.length +
        submodules.length +
        worktrees.length,
    }),
    [
      localBranches.length,
      remoteCount,
      filteredPrs,
      filteredTags,
      filteredStashes,
      filteredSubmodules,
      filteredWorktrees,
      allBranches.length,
      allPrs.length,
      tags.length,
      stashes.length,
      submodules.length,
      worktrees.length,
    ]
  )

  return { sections, isPinned, filterStats, prunableWorktrees, worktrees, allLocalBranches }
}
