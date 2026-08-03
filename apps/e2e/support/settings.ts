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
 * Persisted slices that must not carry over from one scenario to the next.
 *
 * The suite drives one shared app window through every feature, and these all live in
 * localStorage, so without clearing them a run accumulates: `game-store` is the rewards XP and
 * unlocked trophies (a later scenario asserting "this commit unlocks the first trophy" inherits an
 * account that already has it), `notifications` and `undo-history` grow, `launchpad` carries
 * snoozes and saved filters into a feature that asserts on an unfiltered list, and the three AI
 * caches replay a previous scenario's answers instead of exercising the real call.
 *
 * Deliberately NOT here, and the list was cut down to this after measuring: `settings` and
 * `git-graph-columns` are re-seeded by the same hook right after, so clearing them is pointless;
 * `repos`, `repos-ui` and `dashboard` hold the open tabs and the saved repositories that scenarios
 * which never navigate rely on still being there — wiping `dashboard` alone broke "I open the
 * settings" in eight scenarios, because the entry point it clicks is on a screen that then had
 * nothing to show. `notifications` and `undo-history` were dropped for the same reason: they grow
 * across a run, but no scenario was observed inheriting a wrong result from them, and clearing
 * them cost more than it bought.
 */
const VOLATILE_PERSISTED_KEYS = [
  'git-manager-game-store',
  'git-manager-launchpad',
  'git-manager-ai-explanations',
  'git-manager-ai-commit-searches',
  'git-manager-action-explanations',
]

/**
 * Clears {@link VOLATILE_PERSISTED_KEYS} and seeds `patch` in ONE round trip.
 *
 * The single `execute` is the point, not an optimisation. A previous attempt reset this state
 * through an extra `browser.execute` per scenario and put the driver into a run-long
 * "No window could be found" storm (see COVERAGE.md's gotcha on it) — this harness cannot absorb an
 * added command per scenario, so the reset rides inside one the hook already issues.
 *
 * Like {@link seedSettings}, this lands in localStorage and therefore takes effect on the scenario's
 * next load; pair it with {@link forceLiveSettings} for state that must be right from the first
 * render of a scenario that never navigates.
 */
export async function seedSettingsFromCleanState(
  patch: Record<string, unknown>,
  volatileKeys: string[] = VOLATILE_PERSISTED_KEYS
): Promise<void> {
  await browser.execute(
    (raw: string, keysRaw: string) => {
      for (const key of JSON.parse(keysRaw) as string[]) window.localStorage.removeItem(key)
      const key = 'git-manager-settings'
      const stored = window.localStorage.getItem(key)
      const data = stored ? JSON.parse(stored) : { state: {}, version: 0 }
      data.state = data.state ?? {}
      data.state.settings = { ...(data.state.settings ?? {}), ...JSON.parse(raw) }
      window.localStorage.setItem(key, JSON.stringify(data))
    },
    JSON.stringify(patch),
    JSON.stringify(volatileKeys)
  )
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
export async function forceLiveSettings(
  patch: Record<string, Record<string, unknown>>
): Promise<void> {
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
