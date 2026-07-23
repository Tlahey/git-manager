import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { Input, Textarea, NativeSelect } from '@git-manager/ui'
import { TagInput } from '@git-manager/components'
import { WorktreeDefaultFilesSetting } from './WorktreeDefaultFilesSetting'
import { RunTasksSetting } from './RunTasksSetting'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { useSettingsStore } from '../../../stores/settings.store'
import { useCanonicalRepoPath } from '../../../hooks/useCanonicalRepoPath'
import { useEffectiveRepoSettings } from '../../../hooks/useEffectiveRepoSettings'
import { useUserThemes } from '../../../hooks/useUserThemes'
import { BUILTIN_THEMES } from '../../../lib/themes'
import { FilterableSetting, Highlight } from './settingsSearch'

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
        <label className="text-xs font-medium text-foreground">
          <Highlight text={label} />
        </label>
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

/** Which local settings sub-page is shown. `gitflow` and `worktree`/`run` are repo-only (no global
 * counterpart); `appearance` and `ai_commit` mirror the corresponding global sections. */
export type RepoSettingsCategory = 'gitflow' | 'appearance' | 'ai_commit' | 'worktree' | 'run'

interface RepositorySectionProps {
  /** `gitflow` → default branch name + protected branches; `appearance` → theme; `ai_commit` →
   * commit style; `worktree` → default files copied into new worktrees; `run` → runnable tasks. */
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
  // Terminal colours are overridden as a unit (both the background and text), mirroring the global
  // "Integrated terminal colours" block — so the repo view matches and the toggle governs both.
  const terminalOverridden =
    override?.terminalBackground !== undefined || override?.terminalForeground !== undefined
  const instructionsOverridden = override?.commitInstructions !== undefined
  const patternOverridden = override?.commitPattern !== undefined

  return (
    <div data-testid="repository-section" className="space-y-6">
      <div className="space-y-1">
        <h4 className="text-xs font-semibold text-foreground">{t('settings.repository.title')}</h4>
        <p data-testid="repository-name" className="font-mono text-xs text-foreground">
          {repoDisplayName(activeRepo)}
        </p>
      </div>

      {/* Scope hint as a standalone info card rather than a plain caption. */}
      <div
        data-testid="repository-hint"
        className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2"
      >
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {t('settings.repository.hint')}
        </p>
      </div>

      {/* Theme (appearance category) */}
      {category === 'appearance' && (
        <FilterableSetting match={`${t('settings.appearance.theme')} theme thème couleur apparence`}>
          <OverrideField
            label={t('settings.appearance.theme')}
            isOverridden={themeOverridden}
            onInherit={() => resetRepoSetting(activeRepo, 'theme')}
            onOverride={() => setRepoSetting(activeRepo, 'theme', effective.theme)}
            testId="repo-override-theme"
          >
            <NativeSelect
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
            </NativeSelect>
          </OverrideField>
        </FilterableSetting>
      )}

      {/* Integrated terminal colours (appearance category) — same two-swatch + preview view as the
          global page, wrapped in one inherit/override toggle governing both colours. */}
      {category === 'appearance' && (
        <FilterableSetting
          match={`${t('settings.appearance.terminalColors')} terminal background foreground text colours couleurs fond texte shell zsh console`}
        >
          <OverrideField
            label={t('settings.appearance.terminalColors')}
            isOverridden={terminalOverridden}
            onInherit={() => {
              resetRepoSetting(activeRepo, 'terminalBackground')
              resetRepoSetting(activeRepo, 'terminalForeground')
            }}
            onOverride={() => {
              setRepoSetting(activeRepo, 'terminalBackground', effective.terminalBackground)
              setRepoSetting(activeRepo, 'terminalForeground', effective.terminalForeground)
            }}
            testId="repo-override-terminal"
          >
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                {t('settings.appearance.terminalBackground')}
                <input
                  type="color"
                  data-testid="repo-terminal-bg"
                  disabled={!terminalOverridden}
                  value={effective.terminalBackground}
                  onChange={(e) => setRepoSetting(activeRepo, 'terminalBackground', e.target.value)}
                  className="h-8 w-16 cursor-pointer rounded border border-input bg-background disabled:opacity-60"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                {t('settings.appearance.terminalForeground')}
                <input
                  type="color"
                  data-testid="repo-terminal-fg"
                  disabled={!terminalOverridden}
                  value={effective.terminalForeground}
                  onChange={(e) => setRepoSetting(activeRepo, 'terminalForeground', e.target.value)}
                  className="h-8 w-16 cursor-pointer rounded border border-input bg-background disabled:opacity-60"
                />
              </label>
              <div
                className="flex h-8 items-center rounded border border-input px-3 font-mono text-xs"
                style={{
                  backgroundColor: effective.terminalBackground,
                  color: effective.terminalForeground,
                }}
                data-testid="repo-terminal-preview"
              >
                $ git status
              </div>
            </div>
          </OverrideField>
        </FilterableSetting>
      )}

      {/* GitFlow (gitflow category) — default branch name + protected branches, per-repo only (no
          global setting). Seeded from built-in defaults; editing persists a per-repo override. */}
      {category === 'gitflow' && (
        <>
          <div className="space-y-2" data-testid="repo-default-branch-name">
            <label className="text-xs font-medium text-foreground">
              <Highlight text={t('settings.git.defaultBranchName')} />
            </label>
            <Input
              data-testid="repo-default-branch-input"
              value={effective.defaultBranchName}
              onChange={(e) => setRepoSetting(activeRepo, 'defaultBranchName', e.target.value)}
              placeholder="main"
              className="h-8 w-40 text-xs"
            />
          </div>

          <div className="space-y-2" data-testid="repo-protected-branches">
            <label className="text-xs font-medium text-foreground">
              <Highlight text={t('settings.git.protectedBranches')} />
            </label>
            <TagInput
              tags={effective.protectedBranches}
              onChange={(branches) => setRepoSetting(activeRepo, 'protectedBranches', branches)}
              placeholder="main, master…"
            />
          </div>
        </>
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

      {/* Runnable project tasks (run category) — repo-only, no inherit/override toggle. */}
      {category === 'run' && <RunTasksSetting key={activeRepo} repoPath={activeRepo} />}
    </div>
  )
}
