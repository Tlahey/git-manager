import type { ReactNode } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Input, Textarea } from '@git-manager/ui'
import { TagInput } from './TagInput'
import { WorktreeDefaultFilesSetting } from './WorktreeDefaultFilesSetting'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { useSettingsStore } from '../../../stores/settings.store'
import { useCanonicalRepoPath } from '../../../hooks/useCanonicalRepoPath'
import { useEffectiveRepoSettings } from '../../../hooks/useEffectiveRepoSettings'
import { useUserThemes } from '../../../hooks/useUserThemes'
import { BUILTIN_THEMES } from '../../../lib/themes'

/** Last path segment of a repo path, e.g. "/home/me/proj" → "proj". */
function repoDisplayName(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

interface OverrideFieldProps {
  label: string
  isOverridden: boolean
  onInherit: () => void
  onOverride: () => void
  testId: string
  /** The editable/preview control. It is rendered disabled by the caller when inheriting. */
  children: ReactNode
}

/** One overridable setting: a label, an Inherit ↔ Override segmented toggle, and its control. */
function OverrideField({
  label,
  isOverridden,
  onInherit,
  onOverride,
  testId,
  children,
}: OverrideFieldProps) {
  const { t } = useTranslation('settings')
  const base = 'cursor-pointer rounded border px-2 py-0.5 text-[11px] transition-colors'
  const active = 'border-primary bg-primary/10 text-foreground'
  const inactive = 'border-border text-muted-foreground hover:bg-accent'
  return (
    <div className="space-y-2" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-foreground">{label}</label>
        <div className="flex gap-1">
          <button
            type="button"
            data-testid={`${testId}-inherit`}
            onClick={onInherit}
            className={`${base} ${isOverridden ? inactive : active}`}
          >
            {t('settings.repository.inherit')}
          </button>
          <button
            type="button"
            data-testid={`${testId}-override`}
            onClick={onOverride}
            className={`${base} ${isOverridden ? active : inactive}`}
          >
            {t('settings.repository.override')}
          </button>
        </div>
      </div>
      {children}
    </div>
  )
}

/** Which local settings sub-page is shown (mirrors the corresponding global sections, plus the
 * repo-only `worktree` page). */
export type RepoSettingsCategory = 'general' | 'appearance' | 'ai_commit' | 'worktree'

interface RepositorySectionProps {
  /** `general` → protected branches; `appearance` → theme; `ai_commit` → commit style;
   * `worktree` → default files copied into new worktrees. */
  category: RepoSettingsCategory
}

/**
 * Per-repository settings overrides for the active repo, split by `category` so the Local scope has
 * a side menu mirroring the global one. Each overridable field can either inherit the global value
 * or hold a local override: inheriting shows the global value read-only; overriding seeds an
 * editable control from the current effective value. With no repo open, only a hint is shown.
 */
export function RepositorySection({ category }: RepositorySectionProps) {
  const { t } = useTranslation('settings')
  // The active tab may be a linked worktree; scope every override to the repo that owns it so all
  // its worktrees share one configuration (and the panel shows the repo, not the worktree).
  const activeRepo = useCanonicalRepoPath(useRepoUIStore((s) => s.activeRepo))
  const setRepoSetting = useSettingsStore((s) => s.setRepoSetting)
  const resetRepoSetting = useSettingsStore((s) => s.resetRepoSetting)
  const override = useSettingsStore((s) =>
    activeRepo ? s.settings.repoOverrides[activeRepo] : undefined
  )
  const effective = useEffectiveRepoSettings(activeRepo)
  const { data: userThemes } = useUserThemes()

  if (!activeRepo) {
    return (
      <div data-testid="repository-section" className="space-y-3">
        <h4 className="text-xs font-semibold text-foreground">{t('settings.repository.title')}</h4>
        <p data-testid="repository-no-repo" className="text-xs text-muted-foreground">
          {t('settings.repository.noRepo')}
        </p>
      </div>
    )
  }

  const themeOverridden = override?.theme !== undefined
  const branchesOverridden = override?.protectedBranches !== undefined
  const instructionsOverridden = override?.commitInstructions !== undefined
  const patternOverridden = override?.commitPattern !== undefined

  return (
    <div data-testid="repository-section" className="space-y-6">
      <div className="space-y-1">
        <h4 className="text-xs font-semibold text-foreground">{t('settings.repository.title')}</h4>
        <p data-testid="repository-name" className="font-mono text-xs text-foreground">
          {repoDisplayName(activeRepo)}
        </p>
        <p className="text-[11px] text-muted-foreground">{t('settings.repository.hint')}</p>
      </div>

      {/* Theme (appearance category) */}
      {category === 'appearance' && (
        <OverrideField
          label={t('settings.appearance.theme')}
          isOverridden={themeOverridden}
          onInherit={() => resetRepoSetting(activeRepo, 'theme')}
          onOverride={() => setRepoSetting(activeRepo, 'theme', effective.theme)}
          testId="repo-override-theme"
        >
          <select
            data-testid="repo-theme-select"
            disabled={!themeOverridden}
            value={effective.theme}
            onChange={(e) => setRepoSetting(activeRepo, 'theme', e.target.value)}
            className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
          >
            {BUILTIN_THEMES.map((th) => (
              <option key={th.id} value={th.id}>
                {t(th.labelKey)}
              </option>
            ))}
            {(userThemes ?? []).map((th) => (
              <option key={th.id} value={th.id}>
                {th.name}
              </option>
            ))}
          </select>
        </OverrideField>
      )}

      {/* Protected branches (general category) */}
      {category === 'general' && (
        <OverrideField
          label={t('settings.git.protectedBranches')}
          isOverridden={branchesOverridden}
          onInherit={() => resetRepoSetting(activeRepo, 'protectedBranches')}
          onOverride={() =>
            setRepoSetting(activeRepo, 'protectedBranches', effective.protectedBranches)
          }
          testId="repo-override-protectedBranches"
        >
          {branchesOverridden ? (
            <div data-testid="repo-protected-branches">
              <TagInput
                tags={effective.protectedBranches}
                onChange={(branches) => setRepoSetting(activeRepo, 'protectedBranches', branches)}
                placeholder="main, master…"
              />
            </div>
          ) : (
            <div
              data-testid="repo-protected-branches-inherited"
              className="min-h-[38px] rounded-md border border-input bg-muted/30 px-3 py-2 text-xs text-muted-foreground opacity-60"
            >
              {effective.protectedBranches.join(', ') || '—'}
            </div>
          )}
        </OverrideField>
      )}

      {/* Commit style (ai_commit category) */}
      {category === 'ai_commit' && (
        <>
          <OverrideField
            label={t('settings.git.commitInstructions')}
            isOverridden={instructionsOverridden}
            onInherit={() => resetRepoSetting(activeRepo, 'commitInstructions')}
            onOverride={() =>
              setRepoSetting(activeRepo, 'commitInstructions', effective.commitInstructions ?? '')
            }
            testId="repo-override-commitInstructions"
          >
            <Textarea
              data-testid="repo-commit-instructions"
              disabled={!instructionsOverridden}
              value={effective.commitInstructions ?? ''}
              onChange={(e) => setRepoSetting(activeRepo, 'commitInstructions', e.target.value)}
              placeholder={t('settings.git.commitInstructionsPlaceholder')}
              rows={3}
              className="resize-none text-xs disabled:opacity-60"
            />
          </OverrideField>

          <OverrideField
            label={t('settings.git.commitPattern')}
            isOverridden={patternOverridden}
            onInherit={() => resetRepoSetting(activeRepo, 'commitPattern')}
            onOverride={() =>
              setRepoSetting(activeRepo, 'commitPattern', effective.commitPattern ?? '')
            }
            testId="repo-override-commitPattern"
          >
            <Input
              data-testid="repo-commit-pattern"
              disabled={!patternOverridden}
              value={effective.commitPattern ?? ''}
              onChange={(e) => setRepoSetting(activeRepo, 'commitPattern', e.target.value)}
              placeholder="^(feat|fix|chore)(\\(.+\\))?: .+"
              className="h-8 font-mono text-xs disabled:opacity-60"
            />
          </OverrideField>
        </>
      )}

      {/* Worktree default files (worktree category) — repo-only, so no inherit/override toggle.
          Keyed by repo so switching repos re-seeds its per-line editing state. */}
      {category === 'worktree' && (
        <WorktreeDefaultFilesSetting key={activeRepo} repoPath={activeRepo} />
      )}
    </div>
  )
}
