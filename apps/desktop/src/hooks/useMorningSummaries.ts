import { useEffect, useRef } from 'react'
import { useDailySummaryStore } from '../stores/dailySummary.store'
import { useSettingsStore } from '../stores/settings.store'
import { isSummaryStale } from '../lib/dailySummaryWindow'
import { generateDailySummary } from '../lib/generateDailySummary'

/**
 * The "every morning" trigger. When the daily-summary feature is enabled with auto-generation on,
 * this regenerates the briefing for each candidate project whose stored summary is stale (i.e. not
 * from today) the first time the launchpad mounts in a session. Runs the projects sequentially so a
 * local LLM isn't hit with a burst of parallel requests, and never retries a path twice per session
 * (success or failure) to avoid loops on a misconfigured provider.
 *
 * `paths` should be a bounded, relevant set (open tabs + favorites) — not every discovered repo.
 */
export function useMorningSummaries(paths: string[]) {
  const enabled = useSettingsStore((s) => s.settings.dailySummary?.enabled ?? true)
  const autoGenerate = useSettingsStore((s) => s.settings.dailySummary?.autoGenerate ?? true)
  const aiConnection = useSettingsStore((s) => s.settings.ai)
  const language = useSettingsStore((s) => s.settings.language)

  // Paths already attempted this session, so a re-render (or a path reappearing) doesn't re-run.
  const attempted = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!enabled || !autoGenerate) return

    const summaries = useDailySummaryStore.getState().summaries
    const stale = paths.filter(
      (path) =>
        !attempted.current.has(path) && isSummaryStale(summaries[path]?.generatedAt)
    )
    if (stale.length === 0) return

    let cancelled = false
    stale.forEach((path) => attempted.current.add(path))

    void (async () => {
      for (const path of stale) {
        if (cancelled) return
        try {
          await generateDailySummary(path, aiConnection, language)
        } catch {
          // A failing project (unreachable provider, invalid repo) shouldn't block the others; the
          // user can retry manually from the panel. Already marked attempted above.
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [paths, enabled, autoGenerate, aiConnection, language])
}
