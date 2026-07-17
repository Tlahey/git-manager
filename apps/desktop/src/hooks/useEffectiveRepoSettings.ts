import type { RepoScopedSettings, RunTask } from '@git-manager/git-types'
import { useSettingsStore } from '../stores/settings.store'
import { useCanonicalRepoPath } from './useCanonicalRepoPath'

/**
 * The overridable settings resolved for a specific repository. Each field is the repo's local
 * override when it has one, otherwise the global default (`repoOverride ?? global`).
 */
export interface EffectiveRepoSettings {
  protectedBranches: string[]
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
 * Resolves the per-repository-overridable settings for `repoPath`, falling back to the global
 * value for any field the repo doesn't override. Pass `null` (e.g. no repo open) to get the plain
 * global values. A repo with no overrides is indistinguishable from global — the critical
 * backward-compatibility guarantee.
 *
 * `repoPath` may be a linked worktree; overrides are always looked up by the owning repo's main
 * worktree (see `useCanonicalRepoPath`) so every worktree shares the repo's configuration.
 *
 * Only the overridable fields are exposed here; every other setting stays global and is read from
 * `useSettingsStore` directly. `worktreeDefaultFiles` is repo-only (no global), so it resolves to
 * an empty list when the repo has no override.
 */
export function useEffectiveRepoSettings(repoPath: string | null): EffectiveRepoSettings {
  const globalProtectedBranches = useSettingsStore((s) => s.settings.git.protectedBranches)
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
    protectedBranches: override?.protectedBranches ?? globalProtectedBranches,
    commitInstructions: override?.commitInstructions ?? globalCommitInstructions,
    commitPattern: override?.commitPattern ?? globalCommitPattern,
    theme: override?.theme ?? globalTheme,
    worktreeDefaultFiles: override?.worktreeDefaultFiles ?? [],
    runTasks: override?.runTasks ?? [],
    defaultRunTaskId: override?.defaultRunTaskId,
  }
}
