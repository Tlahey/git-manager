import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DailySummary } from '@git-manager/ai'

/** A generated briefing kept for one repository, with the moment it was produced so the UI can show
 * "generated this morning" and decide when it's stale. */
export interface StoredDailySummary {
  summary: DailySummary
  /** Epoch milliseconds when this summary was generated. */
  generatedAt: number
}

interface DailySummaryState {
  /** Keyed by repository path — each project keeps its own briefing in the launchpad. */
  summaries: Record<string, StoredDailySummary>
  setSummary: (path: string, summary: DailySummary) => void
  clearSummary: (path: string) => void
}

/**
 * Persists the per-project daily briefings shown in the launchpad. Separate from the transient
 * generation state (loading/error), which lives in `useDailySummary` — this store only holds the
 * last successful result so it survives reloads and is available the next morning without
 * re-running the model.
 */
export const useDailySummaryStore = create<DailySummaryState>()(
  persist(
    (set) => ({
      summaries: {},

      setSummary: (path, summary) =>
        set((state) => ({
          summaries: { ...state.summaries, [path]: { summary, generatedAt: Date.now() } },
        })),

      clearSummary: (path) =>
        set((state) => {
          if (!state.summaries[path]) return state
          const next = { ...state.summaries }
          delete next[path]
          return { summaries: next }
        }),
    }),
    { name: 'git-manager-daily-summaries' }
  )
)
