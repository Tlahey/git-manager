import type { RepoScopedSettings } from '@git-manager/git-types'
import { useSettingsStore } from '../stores/settings.store'

/**
 * The overridable settings resolved for a specific repository. Each field is the repo's local
 * override when it has one, otherwise the global default (`repoOverride ?? global`).
 */
export interface EffectiveRepoSettings {
  protectedBranches: string[]
  commitInstructions: string | undefined
  commitPattern: string | undefined
  theme: string
}

/**
 * Resolves the per-repository-overridable settings for `repoPath`, falling back to the global
 * value for any field the repo doesn't override. Pass `null` (e.g. no repo open) to get the plain
 * global values. A repo with no overrides is indistinguishable from global — the critical
 * backward-compatibility guarantee.
 *
 * Only the four overridable fields are exposed here; every other setting stays global and is read
 * from `useSettingsStore` directly.
 */
export function useEffectiveRepoSettings(repoPath: string | null): EffectiveRepoSettings {
  const globalProtectedBranches = useSettingsStore((s) => s.settings.git.protectedBranches)
  const globalCommitInstructions = useSettingsStore((s) => s.settings.git.commitInstructions)
  const globalCommitPattern = useSettingsStore((s) => s.settings.git.commitPattern)
  const globalTheme = useSettingsStore((s) => s.settings.appearance.theme)
  const override = useSettingsStore((s) =>
    repoPath ? (s.settings.repoOverrides[repoPath] as RepoScopedSettings | undefined) : undefined
  )

  return {
    protectedBranches: override?.protectedBranches ?? globalProtectedBranches,
    commitInstructions: override?.commitInstructions ?? globalCommitInstructions,
    commitPattern: override?.commitPattern ?? globalCommitPattern,
    theme: override?.theme ?? globalTheme,
  }
}
