import useSWR from 'swr'
import { useRepoDataStore } from '../stores/repoData.store'
import { apiGetRepoStatus } from '../api/git.api'
import { apiListWorktrees } from '../api/worktree.api'
import { countChanges, bucketChanges } from '../lib/gitStatusCounts'

export interface LocalWipEntry {
  /** The saved repo's main path — used to key/group and as the repo identity. */
  repoPath: string
  /** The actual worktree directory holding the changes (equals `repoPath` for the main worktree). */
  worktreePath: string
  repoName: string
  /** Branch checked out in this worktree (may be `(detached HEAD)`). */
  branch: string
  /** True when this is the repo's primary worktree (labelled "WIP on <repo>" rather than a branch). */
  isMainWorktree: boolean
  totalChanges: number
  added: number
  modified: number
  deleted: number
  conflicted: number
}

/**
 * Uncommitted work across every saved repo AND each of its worktrees (main + linked branches), so
 * unfinished local work — not just the primary checkout — sits next to remote PRs. One `git status`
 * per worktree, kept fresh on an interval; clean worktrees are dropped.
 */
export function useLocalWipRepos() {
  const savedRepos = useRepoDataStore((s) => s.savedRepos)

  const paths = savedRepos.map((r) => r.path)
  const nameByPath = new Map(savedRepos.map((r) => [r.path, r.name]))

  const { data, error, isLoading, isValidating, mutate } = useSWR<LocalWipEntry[], Error>(
    paths.length > 0 ? ['local-wip-entries', paths.join('\n')] : null,
    async () => {
      const perRepo = await Promise.all(
        paths.map(async (repoPath): Promise<LocalWipEntry[]> => {
          try {
            const worktrees = await apiListWorktrees(repoPath)
            const entries = await Promise.all(
              worktrees.map(async (wt): Promise<LocalWipEntry | null> => {
                try {
                  const status = await apiGetRepoStatus(wt.path)
                  const total = countChanges(status)
                  if (total === 0) return null
                  return {
                    repoPath,
                    worktreePath: wt.path,
                    repoName: nameByPath.get(repoPath) ?? repoPath,
                    branch: wt.branch,
                    isMainWorktree: wt.isMain,
                    totalChanges: total,
                    conflicted: status.conflicted.length,
                    ...bucketChanges(status),
                  }
                } catch (e) {
                  console.warn('Failed to read worktree WIP status', wt.path, e)
                  return null
                }
              })
            )
            return entries.filter((e): e is LocalWipEntry => e !== null)
          } catch (e) {
            // A repo that can't be listed (moved, deleted on disk) simply drops out.
            console.warn('Failed to list worktrees', repoPath, e)
            return []
          }
        })
      )
      return perRepo.flat()
    },
    {
      refreshInterval: 5000,
      revalidateOnFocus: true,
    }
  )

  return {
    entries: data ?? [],
    loading: isLoading,
    isValidating,
    error: error ?? null,
    refresh: mutate,
  }
}
