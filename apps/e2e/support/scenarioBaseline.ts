import { browser } from '@wdio/globals'

/** Persisted slices that must not carry over from one scenario to the next. See `applyBaseline`. */
const VOLATILE_PERSISTED_KEYS = [
  'git-manager-game-store',
  'git-manager-launchpad',
  'git-manager-ai-explanations',
  'git-manager-ai-commit-searches',
  'git-manager-action-explanations',
]

export interface Baseline {
  /** Settings groups (appearance, ai, …) plus scalars like `language`. */
  settings: Record<string, unknown>
  /** Column visibility/width for the commit graph. */
  columns: Record<string, { visible: boolean; width: number }>
}

/**
 * Puts one scenario's starting state in place: clears the volatile persisted slices, patches the
 * live settings store, seeds settings and graph columns into localStorage — in **one** driver
 * command.
 *
 * That single command is the whole point. The tauri service runs an "ensure the active window is
 * focused" hook before *every* command, so each round trip is expensive, and this hook runs before
 * all 160 scenarios: the previous shape issued three commands (live settings, settings seed, column
 * seed) for ~480 round trips per run. Measuring a full run put 58.6 of its 62 minutes outside step
 * execution — the steps themselves total under four minutes — with the per-scenario hooks the
 * dominant remaining candidate.
 *
 * Ordering inside matters and is not arbitrary: the live patch comes first, because zustand-persist
 * writes the whole live settings object back to localStorage in response, which would otherwise
 * overwrite the seeded `language` with the app's French factory default (that is what left
 * rewards.feature asserting English copy against a "Premier Pas" trophy toast). The localStorage
 * writes have to be the last thing to land, since they are what the scenario's own reload reads.
 *
 * Volatile keys, kept deliberately short after measuring: rewards XP and trophies, the Launchpad's
 * filters and snoozes, and the three AI answer caches. NOT `dashboard` — clearing it broke "I open
 * the settings" in eight scenarios, whose entry point sits on a screen that then had nothing to
 * show — nor `repos`/`repos-ui`, which hold the tabs a non-navigating scenario relies on, nor
 * `settings`/`git-graph-columns`, which this very call re-seeds moments later.
 */
export async function applyBaseline(baseline: Baseline): Promise<boolean> {
  return await browser.execute(
    (raw: string) => {
      const { settings, columns, volatileKeys } = JSON.parse(raw) as {
        settings: Record<string, unknown>
        columns: Record<string, unknown>
        volatileKeys: string[]
      }

      // 0. Retire a live trophy toast left by the previous scenario: achievements unlock as a side
      // effect of ordinary git actions and the toast outlives its scenario (4.5s), bleeding into
      // the next one's visual captures. The persisted game key is cleared below, but the toast
      // renders from the LIVE store's `recentUnlock`.
      const gameStore = (
        window as unknown as {
          __e2eGameStore?: { getState: () => { clearRecentUnlock: () => void } }
        }
      ).__e2eGameStore
      gameStore?.getState().clearRecentUnlock()

      // 1. Live settings first — see the note above on why this cannot come after the seed.
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
      if (store) {
        const current = store.getState().settings
        const merged: Record<string, unknown> = {}
        for (const [group, value] of Object.entries(settings)) {
          const isPlainObject = value && typeof value === 'object' && !Array.isArray(value)
          // An empty-object seed means "reset this group", not "change nothing": merging `{}`
          // into the live group is a no-op, which is exactly how a leaked `repoOverrides` theme
          // survived every baseline. Non-empty groups still merge, so a seed can pin two fields
          // without clobbering the rest.
          const isReset = isPlainObject && Object.keys(value as object).length === 0
          merged[group] =
            isPlainObject && !isReset
              ? { ...(current[group] ?? {}), ...(value as Record<string, unknown>) }
              : value
        }
        store.getState().updateSettings(merged)
      }

      // 2. Then the persisted state, so these writes are the ones a reload picks up.
      for (const key of volatileKeys) window.localStorage.removeItem(key)

      const settingsKey = 'git-manager-settings'
      const storedSettings = window.localStorage.getItem(settingsKey)
      const data = storedSettings ? JSON.parse(storedSettings) : { state: {}, version: 0 }
      data.state = data.state ?? {}
      data.state.settings = { ...(data.state.settings ?? {}), ...settings }
      window.localStorage.setItem(settingsKey, JSON.stringify(data))

      window.localStorage.setItem(
        'git-manager-git-graph-columns',
        JSON.stringify({ state: { columns }, version: 0 })
      )

      // Reports whether the app is still standing. A render crash (e.g. the WebKit
      // `NotFoundError: The object can not be found here` seen mid-run) used to unmount
      // everything under #root; with AppErrorBoundary in place it shows the crash fallback
      // instead — either way, a scenario that never navigates would inherit a dead page and time
      // out on every element, so the caller recovers by reloading when this comes back true.
      return (
        (document.getElementById('root')?.childElementCount ?? 0) === 0 ||
        document.querySelector('[data-testid="app-error-boundary"]') !== null
      )
    },
    JSON.stringify({ ...baseline, volatileKeys: VOLATILE_PERSISTED_KEYS })
  )
}
