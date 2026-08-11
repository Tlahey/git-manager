import i18next, { type TFunction } from 'i18next'
import { initReactI18next } from 'react-i18next'

// FR
import frCommon from '../locales/fr/common.json'
import frGit from '../locales/fr/git.json'
import frDashboard from '../locales/fr/dashboard.json'
import frSettings from '../locales/fr/settings.json'
import frErrors from '../locales/fr/errors.json'
import frLaunchpad from '../locales/fr/launchpad.json'
import frBoard from '../locales/fr/board.json'

// EN
import enCommon from '../locales/en/common.json'
import enGit from '../locales/en/git.json'
import enDashboard from '../locales/en/dashboard.json'
import enSettings from '../locales/en/settings.json'
import enErrors from '../locales/en/errors.json'
import enLaunchpad from '../locales/en/launchpad.json'
import enBoard from '../locales/en/board.json'

// ES
import esCommon from '../locales/es/common.json'
import esGit from '../locales/es/git.json'
import esDashboard from '../locales/es/dashboard.json'
import esSettings from '../locales/es/settings.json'
import esErrors from '../locales/es/errors.json'
import esLaunchpad from '../locales/es/launchpad.json'
import esBoard from '../locales/es/board.json'

export type SupportedLanguage = 'fr' | 'en' | 'es'

export const defaultNS = 'common'
export const resources = {
  fr: {
    common: frCommon,
    git: frGit,
    dashboard: frDashboard,
    settings: frSettings,
    errors: frErrors,
    launchpad: frLaunchpad,
    board: frBoard,
  },
  en: {
    common: enCommon,
    git: enGit,
    dashboard: enDashboard,
    settings: enSettings,
    errors: enErrors,
    launchpad: enLaunchpad,
    board: enBoard,
  },
  es: {
    common: esCommon,
    git: esGit,
    dashboard: esDashboard,
    settings: esSettings,
    errors: esErrors,
    launchpad: esLaunchpad,
    board: esBoard,
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
