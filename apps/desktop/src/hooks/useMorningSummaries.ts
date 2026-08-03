import { useEffect, useRef } from 'react'
import { useDailySummaryStore, selectSummariesFor } from '../stores/dailySummary.store'
import { useSettingsStore } from '../stores/settings.store'
import { isSummaryStale, previousWorkingDayKey } from '../lib/dailySummaryWindow'
import { generateDailySummary } from '../lib/generateDailySummary'
import { DEFAULT_TARGET_BRANCHES } from './useEffectiveRepoSettings'

/**
 * The "every morning" trigger. When the daily-summary feature is enabled with auto-generation on,
 * this regenerates the briefing for each candidate project whose newest archived briefing is stale
 * (i.e. not from today) the first time the launchpad mounts in a session. Runs the projects
 * sequentially so a local LLM isn't hit with a burst of parallel requests, and never retries a path
 * twice per session (success, skip or failure) to avoid loops on a misconfigured provider.
 *
 * Most mornings most of these projects have no commits in the window, and `generateDailySummary`
 * returns without calling the model at all — so a dozen open repos cost a dozen cheap git queries,
 * not a dozen model runs.
 *
 * `paths` should be a bounded, relevant set (open tabs + favorites) — not every discovered repo.
 */
export function useMorningSummaries(paths: string[]) {
  const enabled = useSettingsStore((s) => s.settings.dailySummary?.enabled ?? true)
  const autoGenerate = useSettingsStore((s) => s.settings.dailySummary?.autoGenerate ?? true)
  const aiConnection = useSettingsStore((s) => s.settings.ai)
  const language = useSettingsStore((s) => s.settings.language)
  const hydrate = useDailySummaryStore((s) => s.hydrate)

  // Paths already attempted this session, so a re-render (or a path reappearing) doesn't re-run.
  const attempted = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!enabled || !autoGenerate) return

    let cancelled = false

    void (async () => {
      // Staleness is decided against the on-disk archive, so a briefing written this morning by a
      // previous session isn't regenerated after a restart.
      try {
        if (!useDailySummaryStore.getState().hydrated) await hydrate()
      } catch {
        // An unreadable archive shouldn't block generation — it just means nothing looks fresh.
      }
      if (cancelled) return

      // One briefing, about one day: the previous working day. Skipping a repo that already has an
      // entry for it is what stops the run repeating after a restart.
      const targetDate = previousWorkingDayKey()
      const state = useDailySummaryStore.getState()
      const stale = paths.filter(
        (path) =>
          !attempted.current.has(path) &&
          isSummaryStale(selectSummariesFor(state, path).map((entry) => entry.date))
      )
      if (stale.length === 0) return
      stale.forEach((path) => attempted.current.add(path))

      const settings = useSettingsStore.getState().settings
      const saveToRepo = settings.dailySummary?.saveToRepo ?? false

      for (const path of stale) {
        if (cancelled) return
        try {
          await generateDailySummary(path, aiConnection, {
            date: targetDate,
            // Read straight from the store rather than `useEffectiveRepoSettings`: that is a hook,
            // and this loop covers a variable number of repositories.
            targetBranches: settings.repoOverrides[path]?.targetBranches ?? DEFAULT_TARGET_BRANCHES,
            saveToRepo,
            language,
          })
        } catch {
          // A failing project (unreachable provider, invalid repo) shouldn't block the others; the
          // user can retry manually from the panel. Already marked attempted above.
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [paths, enabled, autoGenerate, aiConnection, language, hydrate])
}
