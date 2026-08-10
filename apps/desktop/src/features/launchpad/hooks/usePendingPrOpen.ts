import { useEffect } from 'react'
import { useLaunchpadStore } from '../stores/launchpad.store'
import type { MockPR } from '../../../lib/github/types'

interface PendingPrOpenOptions {
  /** Every PR the Launchpad knows about, snoozed ones included — a click overrides a snooze. */
  prs: MockPR[]
  /** Whether the PR list is still loading; the request waits rather than being declared unfindable. */
  loading: boolean
  onOpen: (pr: MockPR) => void
}

/**
 * Opens the PR that a notification click asked for, once the Launchpad's list can supply it.
 *
 * The click may well land while this page is unmounted (the app can even be hidden), and the PR
 * panel is local state here — so `notificationRouting.ts` leaves the id in the store and this
 * consumes it on arrival. The request is dropped, not held, when the list has finished loading
 * without that PR in it: the alternative is a stale request firing at some unrelated later refresh.
 */
export function usePendingPrOpen({ prs, loading, onOpen }: PendingPrOpenOptions) {
  const pendingOpenPrId = useLaunchpadStore((s) => s.pendingOpenPrId)

  useEffect(() => {
    if (!pendingOpenPrId || loading) return

    const pr = prs.find((p) => p.id === pendingOpenPrId)
    useLaunchpadStore.getState().clearPendingOpenPr()
    if (pr) onOpen(pr)
  }, [pendingOpenPrId, prs, loading, onOpen])
}
