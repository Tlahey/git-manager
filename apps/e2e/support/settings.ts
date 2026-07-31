import { browser } from '@wdio/globals'

/**
 * Merges `patch` into the persisted settings. A partial seed is safe: the store's rehydration
 * merge (mergeSettingsWithDefaults in settings.store.ts) fills every missing group with defaults.
 * Takes effect on the next load — a step that reloads (fixture-open, fixture-build + window nav,
 * etc.) must run right after for the app to pick it up.
 */
export async function seedSettings(patch: Record<string, unknown>): Promise<void> {
  await browser.execute((raw: string) => {
    const key = 'git-manager-settings'
    const stored = window.localStorage.getItem(key)
    const data = stored ? JSON.parse(stored) : { state: {}, version: 0 }
    data.state = data.state ?? {}
    data.state.settings = { ...(data.state.settings ?? {}), ...JSON.parse(raw) }
    window.localStorage.setItem(key, JSON.stringify(data))
  }, JSON.stringify(patch))
}

/**
 * Merges `patch` into the *live* settings store, group by group, via the `__e2eSettingsStore` debug
 * hook (main.tsx) — unlike `seedSettings`, this takes effect immediately, with no reload required.
 *
 * The suite runs every feature in one shared app window, so a scenario whose own Given steps never
 * navigate (e.g. "the git-manager application is running", used by most Settings scenarios) never
 * rehydrates from localStorage and would otherwise inherit whatever a previous scenario last set
 * live (e.g. the theme-picker scenario in settings.feature ending on "dark"). Use this for state
 * that must be right from a scenario's very first render regardless of whether it reloads.
 */
export async function forceLiveSettings(patch: Record<string, Record<string, unknown>>): Promise<void> {
  await browser.execute((raw: string) => {
    const store = (
      window as unknown as {
        __e2eSettingsStore?: {
          getState: () => {
            settings: Record<string, Record<string, unknown>>
            updateSettings: (partial: Record<string, unknown>) => void
          }
        }
      }
    ).__e2eSettingsStore
    if (!store) return
    const parsedPatch = JSON.parse(raw) as Record<string, Record<string, unknown>>
    const current = store.getState().settings
    const merged: Record<string, unknown> = {}
    for (const [group, value] of Object.entries(parsedPatch)) {
      merged[group] = { ...(current[group] ?? {}), ...value }
    }
    store.getState().updateSettings(merged)
  }, JSON.stringify(patch))
}
