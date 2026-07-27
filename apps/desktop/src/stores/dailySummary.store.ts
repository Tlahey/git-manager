import { create } from 'zustand'
import type { DailySummary } from '@git-manager/ai'
import { apiDeleteDailySummary, apiListDailySummaries } from '../api/dailySummary.api'
import { parseDailySummaryMarkdown, type DailySummaryEntry } from '../lib/dailySummaryMarkdown'

/** A briefing kept for one repository on one day, with the file it came from. */
export interface StoredDailySummary extends DailySummaryEntry {
  /** Absolute path of the markdown file — what "open in editor" and "delete" act on. */
  filePath: string
}

interface DailySummaryState {
  /** Keyed by repository path, then by `YYYY-MM-DD`. Two months of briefings per project. */
  entries: Record<string, Record<string, StoredDailySummary>>
  /** True once `hydrate()` has read the archive, so the summaries page can tell "empty archive"
   * apart from "not read yet". */
  hydrated: boolean
  /** Reads the archive from disk into the store. Safe to call repeatedly. */
  hydrate: () => Promise<void>
  setSummary: (entry: StoredDailySummary) => void
  /** Deletes one day's briefing from disk and from the store. */
  removeSummary: (repoPath: string, date: string) => Promise<void>
}

/** The store's index shape, so selectors can be called with either the store or a bare map. */
type SummaryIndex = Pick<DailySummaryState, 'entries'>

/** Newest-first list of a repository's briefings. */
export function selectSummariesFor(state: SummaryIndex, repoPath: string): StoredDailySummary[] {
  return Object.values(state.entries[repoPath] ?? {}).sort((a, b) => b.date.localeCompare(a.date))
}

/** The most recent briefing for a repository — what the launchpad panel and the repo row show. */
export function selectLatestSummary(
  state: SummaryIndex,
  repoPath: string
): StoredDailySummary | undefined {
  return selectSummariesFor(state, repoPath)[0]
}

/** Every briefing across every repository, newest day first. */
export function selectAllSummaries(state: SummaryIndex): StoredDailySummary[] {
  return Object.values(state.entries)
    .flatMap((byDate) => Object.values(byDate))
    .sort((a, b) => b.date.localeCompare(a.date) || a.repoName.localeCompare(b.repoName))
}

/**
 * In-memory index over the on-disk briefing archive.
 *
 * **Not persisted.** The markdown files under `~/.git-manager/summaries/` are the source of truth —
 * they outlive the app, the user can edit them, and a `localStorage` copy would only be a second
 * version of the same text waiting to disagree with the first. The store is rebuilt from disk on
 * demand instead, which is cheap: two months of short markdown files.
 */
export const useDailySummaryStore = create<DailySummaryState>()((set, get) => ({
  entries: {},
  hydrated: false,

  hydrate: async () => {
    const files = await apiListDailySummaries()
    const entries: Record<string, Record<string, StoredDailySummary>> = {}
    for (const file of files) {
      const parsed = parseDailySummaryMarkdown(file.markdown, {
        date: file.date,
        repoPath: file.repoPath,
        repoName: file.repoName,
      })
      // A file with no usable date can't be filed under a day; skipping it keeps a hand-edited or
      // half-written file from breaking the whole archive.
      if (!parsed) continue
      const key = parsed.repoPath || file.repoPath || file.filePath
      entries[key] = { ...entries[key], [parsed.date]: { ...parsed, filePath: file.filePath } }
    }
    set({ entries, hydrated: true })
  },

  setSummary: (entry) =>
    set((state) => ({
      entries: {
        ...state.entries,
        [entry.repoPath]: { ...state.entries[entry.repoPath], [entry.date]: entry },
      },
    })),

  removeSummary: async (repoPath, date) => {
    const entry = get().entries[repoPath]?.[date]
    if (!entry) return
    await apiDeleteDailySummary(entry.filePath)
    set((state) => {
      const byDate = { ...state.entries[repoPath] }
      delete byDate[date]
      return { entries: { ...state.entries, [repoPath]: byDate } }
    })
  },
}))

/** Convenience re-export of the summary shape the panel renders. */
export type { DailySummary }
