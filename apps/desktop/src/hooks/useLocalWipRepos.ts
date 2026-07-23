import useSWR from 'swr'
import { useRepoDataStore } from '../stores/repoData.store'
import { apiGetRepoStatus } from '../api/git.api'
import { countChanges, bucketChanges } from '../lib/gitStatusCounts'

export interface LocalWipRepo {
  path: string
  name: string
  /** Current branch/HEAD label, when the repo has been opened (pulled from the repo cache). */
  head?: string
  totalChanges: number
  added: number
  modified: number
  deleted: number
  conflicted: number
}

/**
 * Uncommitted work across every saved repo — powers the Launchpad's "WIP" tab so unfinished local
 * changes sit next to remote PRs. One `git status` per repo, kept fresh on an interval; repos with a
 * clean working tree are dropped so the list only shows what still needs a commit.
 */
export function useLocalWipRepos() {
  const savedRepos = useRepoDataStore((s) => s.savedRepos)
  const repoCache = useRepoDataStore((s) => s.repoCache)

  const paths = savedRepos.map((r) => r.path)
  const nameByPath = new Map(savedRepos.map((r) => [r.path, r.name]))

  const { data, error, isLoading, isValidating, mutate } = useSWR<LocalWipRepo[], Error>(
    paths.length > 0 ? ['local-wip-repos', paths.join('\n')] : null,
    async () => {
      const results = await Promise.all(
        paths.map(async (path): Promise<LocalWipRepo | null> => {
          try {
            const status = await apiGetRepoStatus(path)
            const total = countChanges(status)
            if (total === 0) return null
            return {
              path,
              name: nameByPath.get(path) ?? path,
              head: repoCache[path]?.head,
              totalChanges: total,
              conflicted: status.conflicted.length,
              ...bucketChanges(status),
            }
          } catch (e) {
            // A repo that can't be stat'd (moved, deleted on disk) simply drops out of the list.
            console.warn('Failed to read local WIP status', path, e)
            return null
          }
        })
      )
      return results.filter((r): r is LocalWipRepo => r !== null)
    },
    {
      refreshInterval: 5000,
      revalidateOnFocus: true,
    }
  )

  return {
    wipRepos: data ?? [],
    loading: isLoading,
    isValidating,
    error: error ?? null,
    refresh: mutate,
  }
}
