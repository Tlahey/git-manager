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
