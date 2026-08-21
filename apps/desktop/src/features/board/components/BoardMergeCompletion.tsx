import { useEffect } from 'react'
import { useSWRConfig } from 'swr'
import { appEventBus, type AppEvent } from '../../../lib/appEventBus'
import { markCardsDoneForMergedBranch } from '../api/markCardsDoneForMergedBranch'

function mergePayload(payload: unknown): { path: string; source: string } | null {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'path' in payload &&
    'source' in payload &&
    typeof (payload as { path: unknown }).path === 'string' &&
    typeof (payload as { source: unknown }).source === 'string'
  ) {
    return payload as { path: string; source: string }
  }
  return null
}

/** Whether an SWR key belongs to the board's own reads — its list of boards, or one board's cards. */
function isBoardKey(key: unknown): boolean {
  return Array.isArray(key) && (key[0] === 'board-list' || key[0] === 'board-detail')
}

/**
 * Renders nothing. Listens for `appEventBus`'s `merge_branch` event (raised by `apiMergeBranch`)
 * and moves whatever card names the merged branch as its `linkedBranch` to its board's done column
 * — see `markCardsDoneForMergedBranch` for the sweep itself.
 *
 * The listener, not `apiMergeBranch`, is what lives in this feature: `api/git/git-branch.api.ts`
 * cannot import the board feature to call this directly without an import cycle (board components
 * already import it, via `api/git.api`, for their own branch actions), which is exactly the case
 * CLAUDE.md's "hook cross-cutting concerns into `appEventBus`" rule exists for.
 *
 * **It also tells the board what it did.** The sweep writes straight to the backend, from outside
 * any board's React tree — so a board on screen, or one sitting in SWR's cache from the last time it
 * was looked at, would go on showing the card where it used to be. The merge is typically run from
 * the graph and the board looked at afterwards, which is precisely the case a mount-time revalidation
 * can lose to SWR's deduping; an explicit revalidation cannot. Only when something actually moved:
 * most merges touch no card at all, and re-reading every board for each of them is a cost with no
 * answer attached.
 *
 * Mounted once by `App`, next to the notch producers.
 */
export function BoardMergeCompletion() {
  const { mutate } = useSWRConfig()

  useEffect(() => {
    return appEventBus.subscribe((event: AppEvent, payload?: unknown) => {
      if (event !== 'merge_branch') return
      const merge = mergePayload(payload)
      if (!merge) return
      void markCardsDoneForMergedBranch(merge.path, merge.source).then((moved) => {
        if (moved > 0) void mutate(isBoardKey)
      })
    })
  }, [mutate])

  return null
}
