/**
 * `~/.git-manager/settings.json` — the app's configuration: what the user set up (settings, GitHub
 * account, dashboard, graph columns) and what they were working on (open tabs, known repositories,
 * per-repo view state), plus their rewards progression.
 *
 * It replaces the webview's `localStorage`, which WebKit keys off the *running process*: a packaged
 * build could not see what a `pnpm dev` run had saved, an update could not be told from a fresh
 * install, and none of it survived a reinstall. A file in the directory the app already owns is
 * readable, backup-able, syncable, and outlives every version bump.
 *
 * - `sections.ts` — what lives in the file, section by section, and where each came from before.
 * - `settingsSchema.ts` / `validate.ts` — the zod schema, and the repair-don't-reject rule.
 * - `appConfigFile.ts` — the loaded document, and the debounced per-section writes.
 * - `configStorage.ts` — the `zustand/persist` storage each store plugs into.
 * - `hydrate.ts` — the single load `main.tsx` awaits before the first render.
 */
export { hydrateConfigStores } from './hydrate'
export {
  flushConfigWrites,
  isConfigDisabled,
  loadAppConfig,
  registerConfigFlushOnUnload,
  resetAppConfigForTests,
} from './appConfigFile'
export { createConfigStorage } from './configStorage'
export {
  CONFIG_SECTIONS,
  SECTION_LEGACY_KEYS,
  SECTION_SCHEMAS,
  type ConfigSection,
} from './sections'
export { validateSection } from './validate'
