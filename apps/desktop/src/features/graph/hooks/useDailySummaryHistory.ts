import { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import {
  useDailySummaryStore,
  selectAllSummaries,
  selectSummariesFor,
  type StoredDailySummary,
} from '../../../stores/dailySummary.store'

/** SWR key for the whole archive. Stable so any caller can `mutate` it after writing a briefing. */
export const DAILY_SUMMARY_HISTORY_KEY = 'daily-summary-history'

/**
 * The archived briefings, read from disk and kept in the store.
 *
 * Pass a `repoPath` to get only that repository's days — which is what every caller does today, the
 * archive being browsed from a repo-scoped panel. The *read* stays global regardless: the archive is
 * one folder of short markdown files, so reading it whole once and slicing per repo costs less than
 * a read per repository and keeps every panel showing the same data.
 *
 * SWR drives the read (loading/error/revalidate), while the parsed entries live in
 * `dailySummary.store` so the launchpad panel and this one never hold two different versions of the
 * same day. The fetcher therefore hydrates the store and reads back from it rather than returning
 * its own copy.
 */
export function useDailySummaryHistory(repoPath?: string) {
  const hydrate = useDailySummaryStore((s) => s.hydrate)
  const removeSummary = useDailySummaryStore((s) => s.removeSummary)
  const entriesByRepo = useDailySummaryStore((s) => s.entries)

  const { isLoading, error, mutate } = useSWR(DAILY_SUMMARY_HISTORY_KEY, () => hydrate(), {
    revalidateOnFocus: false,
  })

  // Derived from the store, not from SWR's data, so a briefing generated elsewhere in the app shows
  // up here without a re-read.
  const entries: StoredDailySummary[] = useMemo(
    () =>
      repoPath
        ? selectSummariesFor({ entries: entriesByRepo }, repoPath)
        : selectAllSummaries({ entries: entriesByRepo }),
    [entriesByRepo, repoPath]
  )

  const remove = useCallback(
    async (entry: StoredDailySummary) => {
      await removeSummary(entry.repoPath, entry.date)
      await mutate()
    },
    [removeSummary, mutate]
  )

  return { entries, isLoading, error, refresh: mutate, remove }
}
