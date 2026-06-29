import { useTranslation, i18next } from '@git-manager/i18n'
import { useSettingsStore } from '../../../stores/settings.store'

export function LanguageSection() {
  const { t } = useTranslation('settings')
  const { settings, updateSettings } = useSettingsStore()

  function handleChange(lang: 'en' | 'fr') {
    updateSettings({ language: lang })
    i18next.changeLanguage(lang)
  }

  const languages: { value: 'en' | 'fr'; label: string }[] = [
    { value: 'en', label: t('settings.language.en') },
    { value: 'fr', label: t('settings.language.fr') },
  ]

  return (
    <div className="space-y-5">
      <p className="text-xs font-medium text-foreground">{t('settings.language.title')}</p>
      <div className="flex gap-3">
        {languages.map((lang) => (
          <label
            key={lang.value}
            className={`flex items-center gap-2 rounded border px-4 py-2 text-sm cursor-pointer transition-colors ${
              settings.language === lang.value
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            <input
              type="radio"
              name="language"
              value={lang.value}
              checked={settings.language === lang.value}
              onChange={() => handleChange(lang.value)}
              className="sr-only"
            />
            {lang.label}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t('settings.language.note')}</p>
    </div>
  )
}
