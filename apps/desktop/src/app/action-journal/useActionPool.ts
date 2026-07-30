import { useMemo } from 'react'
import useSWR from 'swr'
import { apiReadActivityLog } from '../../api/activityLog.api'
import { ACTIVITY_READ_BUDGET, buildActionPool, type PooledAction } from '../../lib/actionPool'

/**
 * How often the journal re-reads the log.
 *
 * A poll rather than an event, because of where the actions happen: the user is *in the main window*
 * committing and pulling, and looking at this one afterwards. Revalidating on focus alone would leave
 * a window they are already watching frozen; a push event would mean a new cross-window contract for
 * something a five-second read of one file settles. Five seconds is also honest about the floor —
 * entries reach disk on a two-second flush timer (see `activityLogPersistence.ts`), so nothing here
 * can be more current than that.
 */
const REFRESH_INTERVAL_MS = 5000

export interface ActionPoolResult {
  actions: PooledAction[]
  /** True only before the first read resolves — a refresh must not blank the list. */
  isLoading: boolean
  error: Error | undefined
  /** Re-reads the log now, for the toolbar's refresh button. */
  refresh: () => void
}

/**
 * The last fifty actions, read off the on-disk activity log.
 *
 * Disk rather than the in-memory buffer because the journal is its own `WebviewWindow`, and therefore
 * its own JS context: `useActivityLogStore` there would be permanently empty. It also means the pool
 * survives a restart, which the buffer does not.
 */
export function useActionPool(): ActionPoolResult {
  const { data, error, isLoading, mutate } = useSWR(
    'action-pool',
    () => apiReadActivityLog(ACTIVITY_READ_BUDGET),
    { refreshInterval: REFRESH_INTERVAL_MS, revalidateOnFocus: true, keepPreviousData: true }
  )

  const actions = useMemo(() => (data ? buildActionPool(data) : []), [data])

  return {
    actions,
    isLoading: isLoading && data === undefined,
    error: error as Error | undefined,
    refresh: () => void mutate(),
  }
}
