import { createContext, useContext } from 'react'

/**
 * The active settings-search query, already normalized (lowercased, accent-stripped) — `''` when the
 * user isn't searching. Provided by `SettingsPage` around the section content so individual settings
 * can filter/highlight themselves without prop-drilling.
 *
 * The context object and its reader live here rather than in `settingsSearch.tsx` so that file
 * exports components only — a module mixing a component with a hook loses Vite's Fast Refresh
 * (`react/only-export-components`).
 */
export const SettingsSearchContext = createContext<string>('')

/** The active normalized settings-search query (`''` when not searching). */
export function useSettingsSearch(): string {
  return useContext(SettingsSearchContext)
}
