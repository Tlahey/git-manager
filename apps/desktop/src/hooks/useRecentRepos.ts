import { useMemo } from 'react'
import { useRepoDataStore } from '../stores/repoData.store'

export interface RecentRepo {
  path: string
  name: string
}

/** How many repos the New Tab page offers by default. */
const DEFAULT_RECENT_LIMIT = 5

/**
 * The repos to offer on the New Tab page: most-recently-opened first (`recentRepoPaths`), then any
 * remaining saved repo that hasn't been opened since the recency list existed — without that tail
 * the page would look empty for anyone upgrading with a populated repo list.
 *
 * Only saved repositories are listed. A linked worktree (a "workspace") is opened straight from the
 * WIP tab without ever being saved, so it lands in `recentRepoPaths` but is deliberately filtered
 * out here — the New Tab page offers repositories, not the workspaces hanging off them.
 */
export function useRecentRepos(limit = DEFAULT_RECENT_LIMIT): RecentRepo[] {
  const savedRepos = useRepoDataStore((s) => s.savedRepos)
  const recentRepoPaths = useRepoDataStore((s) => s.recentRepoPaths)

  return useMemo(() => {
    const savedByPath = new Map(savedRepos.map((r) => [r.path, r.name]))

    const ordered: RecentRepo[] = []
    for (const path of recentRepoPaths ?? []) {
      const name = savedByPath.get(path)
      if (name !== undefined) ordered.push({ path, name })
    }
    const seen = new Set(ordered.map((r) => r.path))
    for (const repo of savedRepos) {
      if (!seen.has(repo.path)) ordered.push({ path: repo.path, name: repo.name })
    }
    return ordered.slice(0, limit)
  }, [savedRepos, recentRepoPaths, limit])
}
