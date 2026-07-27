import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SummaryProgress } from '@git-manager/ai'
import { useDailySummaryStore, selectLatestSummary } from '../stores/dailySummary.store'
import { useSettingsStore } from '../stores/settings.store'
import { isSummaryStale, previousWorkingDayKey } from '../lib/dailySummaryWindow'
import { generateDailySummary } from '../lib/generateDailySummary'
import { useEffectiveRepoSettings } from './useEffectiveRepoSettings'

/**
 * Drives one project's briefings. Reads the newest archived one from `dailySummary.store` and
 * exposes a `generate(date)` that runs the two-phase feature for **that calendar day** and writes
 * the result to the markdown archive.
 *
 * `generate` takes the day rather than assuming one: a briefing is about the work done on a specific
 * date, and the panel lets the user pick which. It defaults to the previous working day, which is
 * what the morning run wants.
 *
 * `progress` is not decoration: generation is one model call per changed file plus one, so a quiet
 * spinner would leave the user unable to tell a slow model from a stuck one.
 *
 * `skipped` distinguishes "the model produced nothing" from "there was nothing to summarize" —
 * without it, a quiet day looks exactly like a broken provider.
 */
export function useDailySummary(path: string) {
  const stored = useDailySummaryStore((s) => selectLatestSummary(s, path))
  // Subscribe to the repo's own slice — a stable reference — and derive the day list from it.
  // Returning `…map(e => e.date)` straight out of the selector builds a new array on every call,
  // and zustand compares with `Object.is`, so each render scheduled the next one: an infinite loop.
  const byDate = useDailySummaryStore((s) => s.entries[path])
  const archivedDays = useMemo(() => Object.keys(byDate ?? {}), [byDate])
  const hydrated = useDailySummaryStore((s) => s.hydrated)
  const hydrate = useDailySummaryStore((s) => s.hydrate)
  const aiConnection = useSettingsStore((s) => s.settings.ai)
  const language = useSettingsStore((s) => s.settings.language)
  const saveToRepo = useSettingsStore((s) => s.settings.dailySummary?.saveToRepo ?? false)
  const { targetBranches } = useEffectiveRepoSettings(path)

  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState<SummaryProgress | null>(null)
  const [skipped, setSkipped] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The archive lives on disk, so the panel has to read it before it can show anything.
  useEffect(() => {
    if (!hydrated) void hydrate().catch(() => undefined)
  }, [hydrated, hydrate])

  const generate = useCallback(
    async (date: string = previousWorkingDayKey()) => {
      setIsGenerating(true)
      setError(null)
      setSkipped(false)
      setProgress(null)
      try {
        const summary = await generateDailySummary(path, aiConnection, {
          date,
          targetBranches,
          saveToRepo,
          language,
          onProgress: setProgress,
        })
        if (summary === null) setSkipped(true)
      } catch (err) {
        setError(String(err))
      } finally {
        setIsGenerating(false)
        setProgress(null)
      }
    },
    [path, aiConnection, language, saveToRepo, targetBranches]
  )

  return {
    summary: stored?.summary ?? null,
    generatedAt: stored?.generatedAt ?? null,
    filePath: stored?.filePath ?? null,
    /** True while the previous working day has no archived briefing. */
    isStale: isSummaryStale(archivedDays),
    isGenerating,
    progress,
    skipped,
    error,
    generate,
  }
}
