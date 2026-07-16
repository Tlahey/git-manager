import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { GitBranch, GitRef, GitSubmodule, GitWorktree } from '@git-manager/git-types'
import { useBranches } from './useBranches'
import { useGitStashes } from './useGitStashes'
import { useGroupedBranches } from './useGroupedBranches'
import { usePullRequests } from './usePullRequests'
import { usePinnedBranchesStore } from '../stores/pinned-branches.store'
import { apiGetTags, apiListSubmodules } from '../api/git.api'
import { apiListWorktrees } from '../api/worktree.api'
import {
  type SidebarRow,
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
  rows: SidebarRow[]
  /** État épinglé effectif d'une branche locale. */
  isPinned: (shortName: string) => boolean
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
  const worktrees = useMemo(() => allWorktrees.filter((wt) => !wt.isMain), [allWorktrees])

  const q = filter.trim().toLowerCase()
  const matchesFilter = (b: GitBranch) => !q || b.shortName.toLowerCase().includes(q)

  const isPinned = (shortName: string): boolean =>
    overrides?.[shortName] ?? DEFAULT_PINNED.includes(shortName)

  // ── Branches locales (filtrées) ────────────────────────────────────
  const localBranches = useMemo(
    () => allBranches.filter((b) => !b.isRemote && matchesFilter(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allBranches, q]
  )

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

  // ── Construction de la liste plate ─────────────────────────────────
  const rows = useMemo(() => {
    const out: SidebarRow[] = []

    const sectionOpen = (key: SectionKey) =>
      openState[`section:${key}`] ?? DEFAULT_SECTION_OPEN[key]
    const subOpen = (id: string, def = true) => openState[id] ?? def

    const isSelected = (b: GitBranch) => selectedBranch === b.shortName || selectedBranch === b.name

    // ----- Local -----
    const localOpen = sectionOpen('local')
    out.push({
      kind: 'section',
      id: 'section:local',
      sectionKey: 'local',
      title: 'Local',
      count: localBranches.length,
      isOpen: localOpen,
    })
    if (localOpen) {
      for (const b of pinnedBranches) {
        out.push({
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
        out.push({ kind: 'divider', id: 'div:pinned' })
      }
      for (const b of ungrouped) {
        out.push({
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
        out.push({
          kind: 'folder',
          id: fid,
          prefix,
          count: branches.length,
          isOpen: open,
          hasHead: branches.some((b) => b.isHead),
        })
        if (open) {
          for (const b of branches) {
            out.push({
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

    // ----- Remotes -----
    if (remoteGroups.length > 0) {
      out.push({ kind: 'divider', id: 'div:remotes' })
      const open = sectionOpen('remotes')
      out.push({
        kind: 'section',
        id: 'section:remotes',
        sectionKey: 'remotes',
        title: 'Remotes',
        count: remoteCount,
        isOpen: open,
      })
      if (open) {
        for (const [remoteName, branches] of remoteGroups) {
          const gid = `remote:${remoteName}`
          const gopen = subOpen(gid, true)
          out.push({
            kind: 'remote-group',
            id: gid,
            remoteName,
            count: branches.length,
            isOpen: gopen,
          })
          if (gopen) {
            for (const b of branches) {
              out.push({
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
    }

    // ----- Pull Requests -----
    {
      out.push({ kind: 'divider', id: 'div:prs' })
      const open = sectionOpen('prs')
      out.push({
        kind: 'section',
        id: 'section:prs',
        sectionKey: 'prs',
        title: 'Pull Requests',
        count: allPrs.length || undefined,
        isOpen: open,
      })
      if (open) {
        if (prsLoading) {
          out.push({
            kind: 'message',
            id: 'pr:loading',
            text: 'Chargement des PRs…',
            loading: true,
          })
        } else if (!isGithub) {
          out.push({
            kind: 'message',
            id: 'pr:nogithub',
            text: 'Connectez un dépôt GitHub pour voir les PRs.',
          })
        } else {
          if (allPrs.length === 0) {
            out.push({ kind: 'message', id: 'pr:empty', text: 'Aucune PR ouverte.' })
          } else {
            for (const pr of allPrs) {
              out.push({
                kind: 'pr',
                id: `pr:${pr.number}`,
                pr,
                isSelected: selectedBranch === pr.headRef,
              })
            }
          }
        }
      }
    }

    // ----- Tags -----
    if (tags.length > 0) {
      out.push({ kind: 'divider', id: 'div:tags' })
      const open = sectionOpen('tags')
      out.push({
        kind: 'section',
        id: 'section:tags',
        sectionKey: 'tags',
        title: 'Tags',
        count: tags.length,
        isOpen: open,
      })
      if (open) {
        for (const tag of tags.slice(0, TAGS_LIMIT)) {
          out.push({
            kind: 'tag',
            id: `tag:${tag.name}`,
            tag,
            isSelected: selectedBranch === tag.name || selectedBranch === tag.shortName,
          })
        }
        if (tags.length > TAGS_LIMIT) {
          out.push({
            kind: 'message',
            id: 'tag:more',
            text: `+ ${tags.length - TAGS_LIMIT} autres tags`,
          })
        }
      }
    }

    // ----- Stashes -----
    if (stashes.length > 0) {
      out.push({ kind: 'divider', id: 'div:stashes' })
      const open = sectionOpen('stashes')
      out.push({
        kind: 'section',
        id: 'section:stashes',
        sectionKey: 'stashes',
        title: 'Stashes',
        count: stashes.length,
        isOpen: open,
      })
      if (open) {
        for (const stash of stashes) {
          out.push({
            kind: 'stash',
            id: `stash:${stash.index}`,
            stash,
            isSelected: selectedBranch === stash.commitOid,
          })
        }
      }
    }

    // ----- Submodules -----
    if (submodules.length > 0) {
      out.push({ kind: 'divider', id: 'div:submodules' })
      const open = sectionOpen('submodules')
      out.push({
        kind: 'section',
        id: 'section:submodules',
        sectionKey: 'submodules',
        title: 'Submodules',
        count: submodules.length,
        isOpen: open,
      })
      if (open) {
        for (const sm of submodules) {
          out.push({ kind: 'submodule', id: `sm:${sm.path}`, sm })
        }
      }
    }

    // ----- Worktrees -----
    // Always shown (unlike Submodules/Tags/Stashes, which hide when empty) — this is the only
    // section whose header carries an "add" action, so it must stay reachable with zero worktrees.
    {
      out.push({ kind: 'divider', id: 'div:worktrees' })
      const open = sectionOpen('worktrees')
      out.push({
        kind: 'section',
        id: 'section:worktrees',
        sectionKey: 'worktrees',
        title: 'Worktrees',
        count: worktrees.length || undefined,
        isOpen: open,
      })
      if (open) {
        if (worktrees.length === 0) {
          out.push({ kind: 'message', id: 'wt:empty', text: 'No linked worktrees.' })
        } else {
          for (const wt of worktrees) {
            out.push({ kind: 'worktree', id: `wt:${wt.path}`, wt })
          }
        }
      }
    }

    return out
  }, [
    openState,
    selectedBranch,
    localBranches.length,
    pinnedBranches,
    ungrouped,
    groups,
    remoteGroups,
    remoteCount,
    allPrs,
    isGithub,
    prsLoading,
    tags,
    stashes,
    submodules,
    worktrees,
  ])

  return { rows, isPinned }
}
