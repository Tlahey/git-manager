import { useCallback, useState } from 'react'
import { useDailySummaryStore } from '../stores/dailySummary.store'
import { useSettingsStore } from '../stores/settings.store'
import { isSummaryStale } from '../lib/dailySummaryWindow'
import { generateDailySummary } from '../lib/generateDailySummary'

/**
 * Drives the per-project daily briefing shown in the launchpad. Reads the persisted result from
 * `dailySummary.store` and exposes a `generate()` that gathers the repo's recent git activity (via
 * the api layer), runs `@git-manager/ai`'s daily-summary feature, and stores the result. Only the
 * connection config + the UI language are ours — instruction, schema, temperature and prompt all
 * live in the package.
 */
export function useDailySummary(path: string) {
  const stored = useDailySummaryStore((s) => s.summaries[path])
  const aiConnection = useSettingsStore((s) => s.settings.ai)
  const language = useSettingsStore((s) => s.settings.language)

  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = useCallback(async () => {
    setIsGenerating(true)
    setError(null)
    try {
      await generateDailySummary(path, aiConnection, language)
    } catch (err) {
      setError(String(err))
    } finally {
      setIsGenerating(false)
    }
  }, [path, aiConnection, language])

  return {
    summary: stored?.summary ?? null,
    generatedAt: stored?.generatedAt ?? null,
    isStale: isSummaryStale(stored?.generatedAt),
    isGenerating,
    error,
    generate,
  }
}
