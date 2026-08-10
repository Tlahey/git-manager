import type { MockPR } from '../github/types'
import type { PreviousPRSnapshot } from '../../stores/notification.store'

/** The watcher's view of one PR for the next poll's diff — see `PreviousPRSnapshot`. */
export function buildPRSnapshot(pr: MockPR): PreviousPRSnapshot {
  return {
    status: pr.status,
    reviewStatus: pr.reviewStatus,
    needsMyReview: !!pr.needsMyReview,
    ciStatus: pr.ciStatus,
    autoMerge: !!pr.autoMerge,
    updatedAt: pr.updatedAt ? new Date(pr.updatedAt).toISOString() : '',
  }
}

export function buildPRSnapshotMap(prs: MockPR[]): Record<string, PreviousPRSnapshot> {
  const map: Record<string, PreviousPRSnapshot> = {}
  for (const pr of prs) {
    map[pr.id] = buildPRSnapshot(pr)
  }
  return map
}

function snapshotsEqual(a: PreviousPRSnapshot, b: PreviousPRSnapshot): boolean {
  return (
    a.status === b.status &&
    a.reviewStatus === b.reviewStatus &&
    a.needsMyReview === b.needsMyReview &&
    (a.ciStatus ?? null) === (b.ciStatus ?? null) &&
    !!a.autoMerge === !!b.autoMerge &&
    a.updatedAt === b.updatedAt
  )
}

/**
 * Whether the baseline already matches what was just polled.
 *
 * The watcher writes the baseline back into the store from inside the very effect that reads it,
 * so an unconditional write would re-trigger the effect forever. Gating the write on "something
 * actually moved" is what makes it converge — and gating it on *any* movement (not just movement
 * that raised a notification) is what stops a change observed while notifications are off from
 * being replayed as a stale alert the moment they're switched back on.
 */
export function snapshotMapsEqual(
  a: Record<string, PreviousPRSnapshot>,
  b: Record<string, PreviousPRSnapshot>
): boolean {
  const aKeys = Object.keys(a)
  if (aKeys.length !== Object.keys(b).length) return false
  return aKeys.every((key) => {
    const other = b[key]
    return !!other && snapshotsEqual(a[key], other)
  })
}
