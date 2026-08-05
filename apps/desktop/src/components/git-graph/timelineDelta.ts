import type { GitGraphNode } from '@git-manager/git-types'
import { isSyntheticRow } from './syntheticRows'

/** What a previewed timeline step changes about the set of commits on screen. */
export interface TimelineDelta {
  /** Commits the step would take away. */
  removed: number
  /** Commits the step would bring back — a redo, replaying work off its undo pins. */
  added: number
}

export const NO_TIMELINE_DELTA: TimelineDelta = { removed: 0, added: 0 }

/**
 * The commits a previewed step adds and removes, as a plain set difference between the last real
 * graph and the previewed one.
 *
 * This is the number the graph could not otherwise show. Motion can't carry it — every surviving
 * row moves by the same amount at the same time, which reads as the list jumping rather than as
 * anything having moved, and the commits that explain the step are precisely the ones absent from
 * the previewed graph, so they never animate at all. A count states it outright instead.
 *
 * Computed from the two node lists rather than from the timeline's step distance, because a step
 * is a *gesture* and a gesture is worth any number of commits — "undo 2 steps" says nothing about
 * how much history moves. Synthetic rows (WIP, CONFLICT) are not commits and never count.
 */
export function computeTimelineDelta(
  liveNodes: GitGraphNode[],
  previewNodes: GitGraphNode[]
): TimelineDelta {
  const live = new Set(liveNodes.map((n) => n.commit.oid).filter((oid) => !isSyntheticRow(oid)))
  const preview = new Set(
    previewNodes.map((n) => n.commit.oid).filter((oid) => !isSyntheticRow(oid))
  )
  // An empty side means the comparison has nothing to say yet — the preview is still loading, or
  // the timeline was opened before the graph had data. Reporting the whole history as removed
  // would be a confident lie at exactly the moment the user is watching.
  if (live.size === 0 || preview.size === 0) return NO_TIMELINE_DELTA

  let removed = 0
  for (const oid of live) if (!preview.has(oid)) removed++
  let added = 0
  for (const oid of preview) if (!live.has(oid)) added++
  return { removed, added }
}
