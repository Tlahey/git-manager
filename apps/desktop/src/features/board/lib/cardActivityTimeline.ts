import type { BoardComment, CardHistoryEntry } from '@git-manager/git-types'

export type ActivityItem =
  | {
      type: 'comment'
      timestamp: number
      comment: BoardComment
      /** The author of the comment this one replies to, resolved from `comment.parentCommentId` —
       * undefined for a top-level comment, or for a reply whose parent isn't in this card's comment
       * list. This tab stays flat (see the module doc comment); a reply gets this small pointer
       * rather than visual nesting, which is reserved for the Comments tab's `commentThreads.ts`. */
      replyingToAuthor?: string
    }
  | { type: 'history'; timestamp: number; entry: CardHistoryEntry }

/**
 * Merges a card's comments and its git-derived history into one newest-first timeline, for the
 * activity panel's "All" tab.
 *
 * Comments carry an ISO `createdAt`; history entries carry a Unix `timestamp` in seconds — both are
 * normalized to epoch milliseconds here so the two interleave by real time rather than sorting as
 * two separately-ordered blocks stitched together.
 *
 * Deliberately stays flat even for a reply: nesting it under its parent here would sit oddly between
 * unrelated history rows once the two are interleaved by timestamp. Nested rendering lives in
 * `commentThreads.ts`, which only the Comments tab uses.
 */
export function buildActivityTimeline(
  comments: BoardComment[],
  history: CardHistoryEntry[]
): ActivityItem[] {
  const byId = new Map(comments.map((comment) => [comment.id, comment]))
  const items: ActivityItem[] = [
    ...comments.map((comment): ActivityItem => ({
      type: 'comment',
      timestamp: new Date(comment.createdAt).getTime(),
      comment,
      replyingToAuthor: comment.parentCommentId
        ? byId.get(comment.parentCommentId)?.author
        : undefined,
    })),
    ...history.map((entry): ActivityItem => ({
      type: 'history',
      timestamp: entry.timestamp * 1000,
      entry,
    })),
  ]
  return items.sort((a, b) => b.timestamp - a.timestamp)
}
