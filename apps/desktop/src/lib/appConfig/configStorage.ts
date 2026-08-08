import { createJSONStorage, type PersistStorage } from 'zustand/middleware'
import { isConfigDisabled, readConfigSection, writeConfigSection } from './appConfigFile'
import type { ConfigSection } from './sections'

/**
 * Backs one `zustand/persist` store with its section of `~/.git-manager/settings.json`.
 *
 * The store keeps its `name` — `git-manager-settings`, `git-manager-repos-ui`, … — because that name
 * is still the `localStorage` key it falls back to when the configuration file is switched off
 * (`GIT_MANAGER_NO_CONFIG`). The two paths are deliberately the *same* store with a different
 * backing: the e2e suite runs with the file off and seeds those keys exactly as it always has, so
 * turning the file off is a change of storage, never of behaviour.
 *
 * Reads are synchronous because the whole document was loaded before the first render
 * (`loadAppConfig`, awaited in `main.tsx`); every store here is created with `skipHydration` and
 * rehydrated explicitly afterwards — see `hydrate.ts`.
 */
export function createConfigStorage(section: ConfigSection): PersistStorage<unknown> {
  const fallback = createJSONStorage<unknown>(() => globalThis.localStorage)

  return {
    getItem(name) {
      if (isConfigDisabled()) return fallback?.getItem(name) ?? null
      return readConfigSection(section)
    },

    setItem(name, value) {
      if (isConfigDisabled()) return fallback?.setItem(name, value)
      writeConfigSection(section, value.version ?? 0, value.state)
    },

    /** `persist.clearStorage()`. Removes the section from the file rather than emptying it, so a
     * store that has been reset reads as "never configured" on the next launch — which is what the
     * store's own defaults are for. */
    removeItem(name) {
      if (isConfigDisabled()) return fallback?.removeItem(name)
      writeConfigSection(section, 0, null)
    },
  }
}
