import type { RepoScopedSettings, RunTask } from '@git-manager/git-types'
import { useSettingsStore } from '../stores/settings.store'
import { useCanonicalRepoPath } from './useCanonicalRepoPath'

/** Built-in defaults for the per-repo GitFlow settings, applied when a repo has no override (there
 * is no global setting for these). Keeps every repo protected out of the box. */
export const DEFAULT_PROTECTED_BRANCHES = ['main', 'master', 'develop']
export const DEFAULT_BRANCH_NAME = 'main'

/**
 * The overridable settings resolved for a specific repository. Each field is the repo's local
 * override when it has one, otherwise the global default (`repoOverride ?? global`).
 */
export interface EffectiveRepoSettings {
  /** Protected branches for this repo. Per-repo only — resolves to the built-in
   * `DEFAULT_PROTECTED_BRANCHES` when the repo has no override. */
  protectedBranches: string[]
  /** Default branch name for this repo. Per-repo only — resolves to `DEFAULT_BRANCH_NAME` (`main`)
   * when the repo has no override. */
  defaultBranchName: string
  commitInstructions: string | undefined
  commitPattern: string | undefined
  theme: string
  /** Glob patterns for gitignored local files to copy into new worktrees. Per-repo only — no
   * global fallback, so a repo without an override resolves to an empty list. */
  worktreeDefaultFiles: string[]
  /** Project tasks runnable from the toolbar. Per-repo only — resolves to an empty list when the
   * repo has no override. */
  runTasks: RunTask[]
  /** Id of the default task launched by the primary "Lancer" button, or `undefined` to fall back to
   * the first task. Per-repo only. */
  defaultRunTaskId: string | undefined
}

/**
 * Resolves the per-repository-overridable settings for `repoPath`. `theme` and the commit-style
 * fields fall back to their global setting; the GitFlow fields (`protectedBranches`,
 * `defaultBranchName`) have no global setting and fall back to built-in defaults instead
 * (`DEFAULT_PROTECTED_BRANCHES` / `DEFAULT_BRANCH_NAME`). Pass `null` (e.g. no repo open) to get the
 * plain global/default values.
 *
 * `repoPath` may be a linked worktree; overrides are always looked up by the owning repo's main
 * worktree (see `useCanonicalRepoPath`) so every worktree shares the repo's configuration.
 *
 * `worktreeDefaultFiles` / `runTasks` are repo-only with no default, so they resolve to an empty
 * list when the repo has no override.
 */
export function useEffectiveRepoSettings(repoPath: string | null): EffectiveRepoSettings {
  const globalCommitInstructions = useSettingsStore((s) => s.settings.git.commitInstructions)
  const globalCommitPattern = useSettingsStore((s) => s.settings.git.commitPattern)
  const globalTheme = useSettingsStore((s) => s.settings.appearance.theme)
  const canonicalPath = useCanonicalRepoPath(repoPath)
  const override = useSettingsStore((s) =>
    canonicalPath
      ? (s.settings.repoOverrides[canonicalPath] as RepoScopedSettings | undefined)
      : undefined
  )

  return {
    protectedBranches: override?.protectedBranches ?? DEFAULT_PROTECTED_BRANCHES,
    defaultBranchName: override?.defaultBranchName ?? DEFAULT_BRANCH_NAME,
    commitInstructions: override?.commitInstructions ?? globalCommitInstructions,
    commitPattern: override?.commitPattern ?? globalCommitPattern,
    theme: override?.theme ?? globalTheme,
    worktreeDefaultFiles: override?.worktreeDefaultFiles ?? [],
    runTasks: override?.runTasks ?? [],
    defaultRunTaskId: override?.defaultRunTaskId,
  }
}
