import { useEffect, useState } from 'react'
import { useTranslation, i18next } from '@git-manager/i18n'
import { Button, Input, Separator, Checkbox, NativeSelect } from '@git-manager/ui'
import { TagInput } from '@git-manager/components'
import { FilterableSetting, Highlight } from './settingsSearch'
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

  const languages: { value: 'en' | 'fr'; label: string; flag: string }[] = [
    { value: 'en', label: t('settings.language.en'), flag: '🇬🇧' },
    { value: 'fr', label: t('settings.language.fr'), flag: '🇫🇷' },
  ]

  return (
    <div className="space-y-6">
      {/* Language */}
      <FilterableSetting
        className="space-y-2"
        testId="setting-language"
        match={`${t('settings.language.title')} language langue english français anglais francais`}
      >
        <p className="text-xs font-medium text-foreground">
          <Highlight text={t('settings.language.title')} />
        </p>
        <NativeSelect
          data-testid="language-select"
          value={settings.language}
          onChange={(e) => handleLanguageChange(e.target.value as 'en' | 'fr')}
          className="max-w-[220px]"
        >
          {languages.map((lang) => (
            <option key={lang.value} value={lang.value}>
              {lang.flag} {lang.label}
            </option>
          ))}
        </NativeSelect>
      </FilterableSetting>

      {/* Git Identity */}
      <FilterableSetting
        className="space-y-4"
        testId="setting-git-identity"
        match={`${t('settings.git.defaultName')} ${t('settings.git.defaultEmail')} git identity author name email identité auteur nom courriel adresse`}
      >
        <Separator className="mb-4" />
        <h4 className="text-xs font-semibold text-foreground">
          <Highlight text="Identité Git par défaut" />
        </h4>

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
      </FilterableSetting>

      {/* Fetch */}
      <FilterableSetting
        className="space-y-4"
        testId="setting-fetch"
        match={`${t('settings.git.fetchTitle')} ${t('settings.git.autoPrune')} ${t('settings.git.autoFetchInterval')} fetch prune récupération élaguer intervalle`}
      >
        <Separator className="mb-4" />
        <h4 className="text-xs font-semibold text-foreground">
          <Highlight text={t('settings.git.fetchTitle')} />
        </h4>

        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            data-testid="settings-auto-prune"
            checked={git.autoPrune ?? true}
            onChange={(e) => updateGit({ autoPrune: e.target.checked })}
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
            value={git.autoFetchIntervalMinutes ?? 1}
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
      </FilterableSetting>

      {/* Graph */}
      <FilterableSetting
        className="space-y-4"
        testId="setting-graph"
        match={`${t('settings.git.graphTitle')} ${t('settings.git.initialGraphCommits')} ${t('settings.git.lazyLoadGraphCommits')} graph graphe commits lazy chargement`}
      >
        <Separator className="mb-4" />
        <h4 className="text-xs font-semibold text-foreground">
          <Highlight text={t('settings.git.graphTitle')} />
        </h4>

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
          <Checkbox
            data-testid="settings-lazy-load-graph-commits"
            checked={git.lazyLoadGraphCommits ?? true}
            onChange={(e) => updateGit({ lazyLoadGraphCommits: e.target.checked })}
          />
          <span className="text-xs text-foreground">{t('settings.git.lazyLoadGraphCommits')}</span>
        </label>
      </FilterableSetting>

      {/* Advanced Scan */}
      <FilterableSetting
        className="space-y-4"
        testId="setting-advanced-scan"
        match={`${t('settings.advanced.exclusions')} ${t('settings.advanced.scanDepth')} ${t('settings.advanced.openDataFolder')} index scan exclusions depth indexation recherche profondeur dossier données`}
      >
        <Separator className="mb-4" />
        <h4 className="text-xs font-semibold text-foreground">
          <Highlight text="Indexation & Recherche" />
        </h4>

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
      </FilterableSetting>
    </div>
  )
}
