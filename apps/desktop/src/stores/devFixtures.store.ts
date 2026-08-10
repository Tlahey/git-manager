import { create } from 'zustand'
import type { DayCommit, MockIssue } from '../lib/github/types'
import { loadDevFixtures } from '../lib/devFixtures'
import { useNotificationStore } from './notification.store'

/**
 * The development fixtures, once a build that has them has fetched them.
 *
 * They arrive asynchronously now (a dynamic `import()`, so a release build can drop them entirely —
 * see `lib/devFixtures.ts`), and asynchronous data needs somewhere to land. Empty until `load()`
 * has run, and permanently empty in a release build, where `loadDevFixtures()` answers `null`.
 *
 * Not persisted, like `devFlags.store.ts`: fixtures restored from `localStorage` would be a
 * *dataset*, and these are a stand-in for one.
 */

interface DevFixturesState {
  /** `true` once a load has settled, whether or not it found anything. */
  loaded: boolean
  issues: MockIssue[]
  contributions: DayCommit[]
  /** Idempotent, and safe to call from several hooks at once. */
  load: () => Promise<void>
}

/** In flight, so two hooks mounting in the same tick don't each fetch the module. */
let pending: Promise<void> | null = null

export const useDevFixturesStore = create<DevFixturesState>((set, get) => ({
  loaded: false,
  issues: [],
  contributions: [],

  load: () => {
    if (get().loaded) return Promise.resolve()
    if (pending) return pending

    pending = loadDevFixtures()
      .then((fixtures) => {
        if (!fixtures) {
          // A release build. Marked loaded all the same, so nothing keeps retrying a load that has
          // no answer to give.
          set({ loaded: true })
          return
        }
        set({ loaded: true, issues: fixtures.issues, contributions: fixtures.contributions })
        // The pull requests go to the notification store rather than staying here, because that is
        // where `simulateChange` mutates them and where the watcher diffs one poll against the
        // next. Splitting them from their mutator would mean keeping two copies in step.
        useNotificationStore.getState().setMockPRs(fixtures.prs)
      })
      .catch((e) => {
        console.warn('Failed to load the development fixtures:', e)
        set({ loaded: true })
      })
      .finally(() => {
        pending = null
      })

    return pending
  },
}))

/** Resets the module-level in-flight guard. Tests only — nothing in the app reloads fixtures. */
export function resetDevFixturesLoad(): void {
  pending = null
}
