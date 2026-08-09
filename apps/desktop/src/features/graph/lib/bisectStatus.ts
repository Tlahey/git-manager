import type { BisectState } from '@git-manager/git-types'

/** Per-commit bisect annotation, most-specific first. */
export type BisectRowStatus = 'firstBad' | 'current' | 'bad' | 'good' | 'skip'

/**
 * Builds an `oid → status` map from a bisect state for annotating graph rows. A commit can match
 * several roles (the commit under test is also the bad ref once the search resolves); the map keeps
 * the most meaningful one via this precedence: firstBad > current > bad > good > skip.
 */
export function buildBisectStatusMap(
  bisect: BisectState | undefined | null
): Map<string, BisectRowStatus> {
  const map = new Map<string, BisectRowStatus>()
  if (!bisect?.active) return map

  // Applied low-to-high priority so later writes win.
  for (const oid of bisect.skippedOids) map.set(oid, 'skip')
  for (const oid of bisect.goodOids) map.set(oid, 'good')
  if (bisect.badOid) map.set(bisect.badOid, 'bad')
  // While searching, HEAD is the commit under test; once resolved it's the first bad commit, which
  // takes its own status instead.
  if (bisect.currentOid && !bisect.firstBadOid) map.set(bisect.currentOid, 'current')
  if (bisect.firstBadOid) map.set(bisect.firstBadOid, 'firstBad')

  return map
}
