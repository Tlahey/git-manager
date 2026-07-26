import { useCallback, useMemo } from 'react'
import { useRepoDataStore } from '../../../stores/repoData.store'
import {
  useRepoUIStore,
  isNewTab,
  DASHBOARD_TAB,
  PULL_REQUESTS_TAB,
} from '../../../stores/repoUI.store'
import type { SectionRepo } from '../components/RepoSection'

export interface DashboardSections {
  /** Repos currently open in a tab. */
  open: SectionRepo[]
  /** Saved repos flagged `pinned`. */
  favorites: SectionRepo[]
  /** Saved repos ordered most-recently-opened first. */
  recent: SectionRepo[]
  /** Every known repo — saved plus folder-scan discoveries. */
  all: SectionRepo[]
  /** How many repos are known in total, before the search filter is applied. */
  totalKnownCount: number
}

/**
 * Builds the four dashboard lists from the repo store, each filtered by the search box.
 *
 * `totalKnownCount` deliberately ignores the filter: it answers "does this user have any repo at
 * all", which is what decides between the empty state and the sections — filtering everything out
 * should show empty sections, not the first-run onboarding panel.
 */
export function useDashboardSections(filterText: string): DashboardSections {
  const savedRepos = useRepoDataStore((s) => s.savedRepos)
  const discoveredRepos = useRepoDataStore((s) => s.discoveredRepos)
  const recentRepoPaths = useRepoDataStore((s) => s.recentRepoPaths)
  const linkedWorktreePaths = useRepoDataStore((s) => s.linkedWorktreePaths)
  const openTabs = useRepoUIStore((s) => s.openTabs)

  // The dashboard lists repositories, not the workspaces hanging off them: a linked worktree is a
  // view of a repo that is already in the list, so showing it would duplicate the entry under a
  // path the user never registered. See `linkedWorktreePaths` in repoData.store.
  const worktrees = useMemo(
    () => new Set(linkedWorktreePaths ?? []),
    [linkedWorktreePaths]
  )

  const matches = useCallback(
    (repo: SectionRepo) => {
      if (worktrees.has(repo.path)) return false
      if (!filterText) return true
      const text = filterText.toLowerCase()
      return repo.name.toLowerCase().includes(text) || repo.path.toLowerCase().includes(text)
    },
    [filterText, worktrees]
  )

  const open = useMemo(
    () =>
      openTabs
        .filter((path) => path !== DASHBOARD_TAB && path !== PULL_REQUESTS_TAB && !isNewTab(path))
        .map((path) => {
          const saved = savedRepos.find((r) => r.path === path)
          return { path, name: saved ? saved.name : path.split('/').pop() || path }
        })
        .filter(matches),
    [openTabs, savedRepos, matches]
  )

  const favorites = useMemo(
    () =>
      savedRepos.filter((r) => r.pinned).map((r) => ({ path: r.path, name: r.name })).filter(matches),
    [savedRepos, matches]
  )

  const recent = useMemo(() => {
    const savedByPath = new Map(savedRepos.map((r) => [r.path, r.name]))
    return (recentRepoPaths ?? [])
      .map((path) => {
        const name = savedByPath.get(path)
        return name === undefined ? null : { path, name }
      })
      .filter((r): r is SectionRepo => r !== null)
      .filter(matches)
  }, [recentRepoPaths, savedRepos, matches])

  const allKnown = useMemo(() => {
    const byPath = new Map<string, SectionRepo>()
    // Saved entries win: a repo can be both discovered and saved, and the saved name is the one the
    // user actually sees everywhere else.
    for (const r of discoveredRepos ?? []) byPath.set(r.path, { path: r.path, name: r.name })
    for (const r of savedRepos) byPath.set(r.path, { path: r.path, name: r.name })
    // Excluded here too, so `totalKnownCount` stays "how many repositories does this user have" —
    // a user whose only entry is a worktree must still get the first-run empty state.
    return Array.from(byPath.values()).filter((r) => !worktrees.has(r.path))
  }, [discoveredRepos, savedRepos, worktrees])

  const all = useMemo(() => allKnown.filter(matches), [allKnown, matches])

  return { open, favorites, recent, all, totalKnownCount: allKnown.length }
}
