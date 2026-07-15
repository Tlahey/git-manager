import { useTranslation, i18next } from '@git-manager/i18n'
import { Button, Input, Separator } from '@git-manager/ui'
import { TagInput } from './TagInput'
import { UpdateCheck } from './UpdateCheck'
import { OverriddenBadge } from './OverriddenBadge'
import { useSettingsStore } from '../../../stores/settings.store'

export function GeneralSection() {
  const { t } = useTranslation('settings')
  const { settings, updateSettings } = useSettingsStore()
  const git = settings.git
  const advanced = settings.advanced

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
