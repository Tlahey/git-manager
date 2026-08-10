import type { QueryClient } from '@tanstack/react-query'

/**
 * The two invalidations every graph action ends with.
 *
 * Almost anything the context menus run changes both the history and the working tree — a
 * cherry-pick writes a commit *and* can leave conflicts, a stash pop moves work out of the log and
 * into the index — so the pair travels together. Kept as one named function rather than copied into
 * each of the menu hooks: a refresh that drifts by one query is invisible until a row goes stale.
 */
export function refreshLogAndStatus(queryClient: QueryClient, repoPath: string) {
  queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
  queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
}
