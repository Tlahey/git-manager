import { useQuery } from '@tanstack/react-query'
import type { GitWorktree } from '@git-manager/git-types'
import { apiListWorktrees } from '../api/worktree.api'

const EMPTY: GitWorktree[] = []

/**
 * The repo's worktrees, main one included.
 *
 * React Query rather than SWR, against the app's convention for new hooks, for one reason that
 * outweighs it: `['worktrees', repoPath]` is an existing key that `useSidebarRows`, `BranchContext`
 * and `AddWorktreeDialog` already fetch under. Sharing it means this hook adds no request at all —
 * an SWR twin would fetch the same list a second time and, worse, drift out of step with the copy
 * the sidebar is drawing from.
 */
export function useWorktrees(repoPath: string | null): GitWorktree[] {
  const { data } = useQuery<GitWorktree[]>({
    queryKey: ['worktrees', repoPath],
    queryFn: () => apiListWorktrees(repoPath as string),
    enabled: !!repoPath,
    staleTime: 30_000,
  })
  return data ?? EMPTY
}
