import i18next, { type TFunction } from 'i18next'
import { initReactI18next } from 'react-i18next'

// FR
import frCommon from '../locales/fr/common.json'
import frGit from '../locales/fr/git.json'
import frDashboard from '../locales/fr/dashboard.json'
import frSettings from '../locales/fr/settings.json'
import frErrors from '../locales/fr/errors.json'

// EN
import enCommon from '../locales/en/common.json'
import enGit from '../locales/en/git.json'
import enDashboard from '../locales/en/dashboard.json'
import enSettings from '../locales/en/settings.json'
import enErrors from '../locales/en/errors.json'

export type SupportedLanguage = 'fr' | 'en'

export const defaultNS = 'common'
export const resources = {
  fr: {
    common: frCommon,
    git: frGit,
    dashboard: frDashboard,
    settings: frSettings,
    errors: frErrors,
  },
  en: {
    common: enCommon,
    git: enGit,
    dashboard: enDashboard,
    settings: enSettings,
    errors: enErrors,
  },
} as const

export function initI18n(language: SupportedLanguage = 'fr') {
  return i18next.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    defaultNS,
    resources,
    interpolation: {
      escapeValue: false,
    },
  })
}

export { i18next }
export { useTranslation } from 'react-i18next'
export type { TFunction }
