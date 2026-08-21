import type { BoardComment, CardHistoryEntry } from '@git-manager/git-types'

export type ActivityItem =
  | { type: 'comment'; timestamp: number; comment: BoardComment }
  | { type: 'history'; timestamp: number; entry: CardHistoryEntry }

/**
 * Merges a card's comments and its git-derived history into one newest-first timeline, used for the
 * activity panel's total count and for the History tab's own ordering.
 *
 * Comments carry an ISO `createdAt`; history entries carry a Unix `timestamp` in seconds — both are
 * normalized to epoch milliseconds here so the two interleave by real time rather than sorting as
 * two separately-ordered blocks stitched together.
 */
export function buildActivityTimeline(
  comments: BoardComment[],
  history: CardHistoryEntry[]
): ActivityItem[] {
  const items: ActivityItem[] = [
    ...comments.map((comment): ActivityItem => ({
      type: 'comment',
      timestamp: new Date(comment.createdAt).getTime(),
      comment,
    })),
    ...history.map((entry): ActivityItem => ({
      type: 'history',
      timestamp: entry.timestamp * 1000,
      entry,
    })),
  ]
  return items.sort((a, b) => b.timestamp - a.timestamp)
}
