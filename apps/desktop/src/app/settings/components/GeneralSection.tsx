import { useEffect, useState } from 'react'
import { useTranslation, i18next } from '@git-manager/i18n'
import { Button, Input, Separator } from '@git-manager/ui'
import { TagInput } from './TagInput'
import { UpdateCheck } from './UpdateCheck'
import { OverriddenBadge } from './OverriddenBadge'
import { useSettingsStore } from '../../../stores/settings.store'

/** Graph commit-load bounds — kept in sync with the GitSettings defaults and GitGraph's fetch. */
const MIN_GRAPH_COMMITS = 500
const DEFAULT_GRAPH_COMMITS = 2000

export function GeneralSection() {
  const { t } = useTranslation('settings')
  const { settings, updateSettings } = useSettingsStore()
  const git = settings.git
  const advanced = settings.advanced

  // Local draft for the numeric field so the user can clear it mid-edit (a NaN guard on the store
  // would otherwise snap it back). Re-synced whenever the persisted value changes (e.g. per-page
  // reset). Clamped to the 500 floor on blur.
  const [commitsDraft, setCommitsDraft] = useState(
    String(git.initialGraphCommits ?? DEFAULT_GRAPH_COMMITS)
  )
  useEffect(() => {
    setCommitsDraft(String(git.initialGraphCommits ?? DEFAULT_GRAPH_COMMITS))
  }, [git.initialGraphCommits])

  function handleLanguageChange(lang: 'en' | 'fr') {
    updateSettings({ language: lang })
    i18next.changeLanguage(lang)
  }

  function updateGit(partial: Partial<typeof git>) {
    updateSettings({ git: { ...git, ...partial } })
  }

  function updateAdvanced(partial: Partial<typeof advanced>) {
    updateSettings({ advanced: { ...advanced, ...partial } })
  }

  async function handleOpenDataFolder() {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open('~/.config/git-manager/').catch(() => {})
  }

  const languages: { value: 'en' | 'fr'; label: string }[] = [
    { value: 'en', label: t('settings.language.en') },
    { value: 'fr', label: t('settings.language.fr') },
  ]

  return (
    <div className="space-y-6">
      {/* Updates */}
      <UpdateCheck />

      <Separator />

      {/* Language */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">{t('settings.language.title')}</p>
        <div className="flex gap-3">
          {languages.map((lang) => (
            <label
              key={lang.value}
              className={`flex cursor-pointer items-center gap-2 rounded border px-4 py-2 text-sm transition-colors ${
                settings.language === lang.value
                  ? 'border-primary bg-primary/10 font-medium text-foreground'
                  : 'border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              <input
                type="radio"
                name="language"
                value={lang.value}
                checked={settings.language === lang.value}
                onChange={() => handleLanguageChange(lang.value)}
                className="sr-only"
              />
              {lang.label}
            </label>
          ))}
        </div>
      </div>

      <Separator />

      {/* Git Identity */}
      <div className="space-y-4">
        <h4 className="text-xs font-semibold text-foreground">Identité Git par défaut</h4>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">
            {t('settings.git.defaultName')}
          </label>
          <Input
            value={git.defaultAuthorName}
            onChange={(e) => updateGit({ defaultAuthorName: e.target.value })}
            className="h-8 text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">
            {t('settings.git.defaultEmail')}
          </label>
          <Input
            type="email"
            value={git.defaultAuthorEmail}
            onChange={(e) => updateGit({ defaultAuthorEmail: e.target.value })}
            className="h-8 text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">
            {t('settings.git.defaultBranchName')}
          </label>
          <Input
            data-testid="settings-default-branch-name"
            value={git.defaultBranchName ?? 'main'}
            onChange={(e) => updateGit({ defaultBranchName: e.target.value })}
            placeholder="main"
            className="h-8 w-40 text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-foreground">
              {t('settings.git.protectedBranches')}
            </label>
            <OverriddenBadge field="protectedBranches" />
          </div>
          <TagInput
            tags={git.protectedBranches}
            onChange={(branches) => updateGit({ protectedBranches: branches })}
            placeholder="main, master…"
          />
        </div>
      </div>

      <Separator />

      {/* Fetch */}
      <div className="space-y-4">
        <h4 className="text-xs font-semibold text-foreground">{t('settings.git.fetchTitle')}</h4>

        <label className="flex cursor-pointer items-center gap-2">
          <input
            data-testid="settings-auto-prune"
            type="checkbox"
            checked={git.autoPrune ?? true}
            onChange={(e) => updateGit({ autoPrune: e.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-xs text-foreground">{t('settings.git.autoPrune')}</span>
        </label>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">
            {t('settings.git.autoFetchInterval')}
          </label>
          <Input
            data-testid="settings-auto-fetch-interval"
            type="number"
            min={0}
            max={60}
            value={git.autoFetchIntervalMinutes ?? 0}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10)
              const clamped = Number.isNaN(n) ? 0 : Math.min(60, Math.max(0, n))
              updateGit({ autoFetchIntervalMinutes: clamped })
            }}
            className="h-8 w-24 text-xs"
          />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t('settings.git.autoFetchIntervalHint')}
          </p>
        </div>
      </div>

      <Separator />

      {/* Graph */}
      <div className="space-y-4">
        <h4 className="text-xs font-semibold text-foreground">{t('settings.git.graphTitle')}</h4>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">
            {t('settings.git.initialGraphCommits')}
          </label>
          <Input
            data-testid="settings-initial-graph-commits"
            type="number"
            min={MIN_GRAPH_COMMITS}
            step={500}
            value={commitsDraft}
            onChange={(e) => {
              setCommitsDraft(e.target.value)
              const n = parseInt(e.target.value, 10)
              if (!Number.isNaN(n)) updateGit({ initialGraphCommits: n })
            }}
            onBlur={() => {
              const n = parseInt(commitsDraft, 10)
              const clamped = Number.isNaN(n) ? DEFAULT_GRAPH_COMMITS : Math.max(MIN_GRAPH_COMMITS, n)
              updateGit({ initialGraphCommits: clamped })
              setCommitsDraft(String(clamped))
            }}
            className="h-8 w-28 text-xs"
          />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t('settings.git.initialGraphCommitsHint')}
          </p>
        </div>

        <label className="flex cursor-pointer items-center gap-2">
          <input
            data-testid="settings-lazy-load-graph-commits"
            type="checkbox"
            checked={git.lazyLoadGraphCommits ?? true}
            onChange={(e) => updateGit({ lazyLoadGraphCommits: e.target.checked })}
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-xs text-foreground">{t('settings.git.lazyLoadGraphCommits')}</span>
        </label>
      </div>

      <Separator />

      {/* Advanced Scan */}
      <div className="space-y-4">
        <h4 className="text-xs font-semibold text-foreground">Indexation & Recherche</h4>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">
            {t('settings.advanced.exclusions')}
          </label>
          <TagInput
            tags={advanced.scanExclusions}
            onChange={(tags) => updateAdvanced({ scanExclusions: tags })}
            placeholder="node_modules, dist…"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">
            {t('settings.advanced.scanDepth')}
          </label>
          <Input
            type="number"
            min={1}
            max={10}
            value={advanced.maxScanDepth}
            onChange={(e) => updateAdvanced({ maxScanDepth: parseInt(e.target.value, 10) })}
            className="h-8 w-24 text-xs"
          />
        </div>

        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleOpenDataFolder}>
          {t('settings.advanced.openDataFolder')}
        </Button>
      </div>
    </div>
  )
}
