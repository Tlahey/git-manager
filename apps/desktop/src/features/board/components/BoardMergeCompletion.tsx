import { useEffect } from 'react'
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
 * Mounted once by `App`, next to the notch producers.
 */
export function BoardMergeCompletion() {
  useEffect(() => {
    return appEventBus.subscribe((event: AppEvent, payload?: unknown) => {
      if (event !== 'merge_branch') return
      const merge = mergePayload(payload)
      if (!merge) return
      void markCardsDoneForMergedBranch(merge.path, merge.source)
    })
  }, [])

  return null
}
