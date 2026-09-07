import type { QueryClient } from '@tanstack/react-query'
import { apiOpenRepo } from '../api/repo.api'
import { useRepoDataStore } from '../stores/repoData.store'

/**
 * Re-reads everything that depends on **what HEAD points at**, after something wrote, removed or
 * rewrote a commit.
 *
 * The branch list is the key that keeps being left out, and it is the one that is not obvious: the
 * Push and Pull badges count the commits ahead of / behind the upstream, and those two numbers ride
 * on `GitBranch.aheadCount`/`behindCount` — the *branch* query — not on the log. Refreshing only the
 * log and the working tree therefore redraws the graph correctly while the toolbar goes on claiming
 * there is nothing to push, for as long as `useBranches`' `staleTime` holds and indefinitely after
 * that, since nothing remounts the toolbar and react-query only refetches a stale query on a trigger
 * (a window focus, in practice). That was the bug: commit, and the Push button stayed bare.
 *
 * So every action that changes the commits on the current branch — commit, amend, cherry-pick,
 * revert, reset, fixup/autosquash, rebase, bisect — ends here rather than invalidating the pair by
 * hand.
 */
export function refreshAfterHistoryChange(queryClient: QueryClient, repoPath: string): void {
  queryClient.invalidateQueries({ queryKey: ['branches', repoPath] })
  queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
  queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
}

/**
 * Re-reads everything that depends on **where HEAD is**, after something moved it.
 *
 * Four things go stale together on a checkout, and they are not all queries: the repo summary in
 * `repoData.store` is what the toolbar's branch indicator and every "which branch am I on" decision
 * read, and the three queries `refreshAfterHistoryChange` invalidates are the branch list, the graph
 * and the working tree. Missing any one of them leaves the app describing a repository it has
 * already left.
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
  refreshAfterHistoryChange(queryClient, repoPath)
}
