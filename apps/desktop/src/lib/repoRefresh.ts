import type { QueryClient } from '@tanstack/react-query'
import { apiOpenRepo } from '../api/repo.api'
import { useRepoDataStore } from '../stores/repoData.store'

/**
 * Re-reads everything that depends on **where HEAD is**, after something moved it.
 *
 * Four things go stale together on a checkout, and they are not all queries: the repo summary in
 * `repoData.store` is what the toolbar's branch indicator and every "which branch am I on" decision
 * read, and the three query keys below are the branch list, the graph and the working tree. Missing
 * any one of them leaves the app describing a repository it has already left.
 *
 * It lives here, taking a `QueryClient`, rather than inside the hook that used to own it, because
 * the callers are in two different layers: `useBranchCheckout` (every branch picker in the app) and
 * the Kanban card's own branch actions, which check a branch out without going through a picker at
 * all. That second caller is why this exists — for a while it did not refresh, and the toolbar went
 * on naming the previous branch for as long as `queryClient`'s `staleTime` held (five seconds, and
 * indefinitely if nothing remounted), while ⌘K built its ref commands from that stale name and
 * offered to merge into a branch the repository was no longer on.
 *
 * The cache update is best-effort: a failed `open_repo` must not stop the queries from refreshing,
 * since they are what put the views right.
 */
export async function refreshAfterHeadMove(
  queryClient: QueryClient,
  repoPath: string
): Promise<void> {
  try {
    const fresh = await apiOpenRepo(repoPath)
    useRepoDataStore.getState().setRepoCache(repoPath, fresh)
  } catch {
    /* the queries below still refresh the views even if the cache update failed */
  }
  queryClient.invalidateQueries({ queryKey: ['branches', repoPath] })
  queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
  queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
}
