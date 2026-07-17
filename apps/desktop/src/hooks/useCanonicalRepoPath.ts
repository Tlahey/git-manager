import { useRepoDataStore } from '../stores/repoData.store'

/**
 * Resolves a repo/worktree path to the path of the repository that owns it — i.e. its main
 * worktree. Per-repo settings (protected branches, theme, commit style, worktree default files…)
 * are keyed by this, so every linked worktree shares the owning repo's configuration instead of
 * getting its own isolated settings scoped to the worktree's path.
 *
 * The mapping comes from the cached `GitRepo.mainWorktreePath` (populated by the Rust backend when
 * a repo is opened). Falls back to the given path when the repo isn't cached yet, and returns
 * `null` for a null path.
 */
export function useCanonicalRepoPath(path: string | null): string | null {
  return useRepoDataStore((s) =>
    path ? (s.repoCache[path]?.mainWorktreePath ?? path) : null
  )
}
