import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { GitGraphNode, GitLogHeadOverride } from '@git-manager/git-types'
import { apiGetLog } from '../api/git.api'

interface UseGitLogOptions {
  limit?: number
  skip?: number
  branch?: string
  /** Solo mode: branch shortNames to isolate. When non-empty the graph loads only the commits
   * reachable from these branches (server-side filter in `get_log`). Part of the query key. */
  soloBranches?: string[]
  showStashes?: boolean
  hiddenStashes?: string[]
  /** Whether a synthetic WIP / paused-rebase row will be rendered above the graph. Part of the
   * query key: when the working tree flips clean↔dirty the Rust column layout genuinely changes
   * (HEAD's lane is only seeded at column 0 while that row exists), so the log is refetched. */
  headHasWip?: boolean
  /**
   * Load the graph *as if* a branch pointed elsewhere — the undo/redo timeline's read-only
   * preview. Read-only in the strictest sense: it only changes this walk's seeds and ref labels.
   *
   * Being part of the query key is the whole caching story: the real log stays in cache under its
   * own key while a preview is on screen, so closing the timeline restores it with no fetch, and
   * scrubbing back to a step already visited is instant.
   */
  headOverride?: GitLogHeadOverride
}

export function useGitLog(repoPath: string, opts?: UseGitLogOptions) {
  return useQuery<GitGraphNode[]>({
    queryKey: ['git-log', repoPath, opts],
    queryFn: () => apiGetLog(repoPath, opts),
    enabled: !!repoPath,
    staleTime: 30_000,
    // Only while previewing: each scrub step is a new query key, and without this the graph would
    // blank out (and raise the app's loading overlay) between every step. Deliberately *not*
    // unconditional — a repo switch is also a new key, and there the previous repo's graph must
    // not linger on screen pretending to be this one's.
    placeholderData: opts?.headOverride ? keepPreviousData : undefined,
  })
}
