import { describe, it, expect } from 'vitest'
import type { BoardComment, CardHistoryEntry } from '@git-manager/git-types'
import { buildActivityTimeline } from './cardActivityTimeline'

function comment(overrides: Partial<BoardComment> = {}): BoardComment {
  return {
    id: 'k1',
    author: 'Ada',
    body: 'Looks good',
    createdAt: '2026-08-01T09:00:00.000Z',
    ...overrides,
  }
}

function entry(overrides: Partial<CardHistoryEntry> = {}): CardHistoryEntry {
  return {
    oid: 'abc1234567',
    shortOid: 'abc1234',
    authorName: 'Ada',
    authorEmail: 'ada@example.com',
    timestamp: 1_754_038_800, // 2025-08-01T09:00:00Z
    kind: 'created',
    changes: [],
    ...overrides,
  }
}

describe('buildActivityTimeline', () => {
  it('is empty when there is neither a comment nor a history entry', () => {
    expect(buildActivityTimeline([], [])).toEqual([])
  })

  it('interleaves comments and history entries by real time, newest first', () => {
    const older = entry({ oid: 'older', shortOid: 'older', timestamp: 1_700_000_000 })
    const newer = comment({ id: 'newer', createdAt: '2026-08-01T09:00:00.000Z' })
    const middle = entry({ oid: 'middle', shortOid: 'middle', timestamp: 1_750_000_000 })

    const timeline = buildActivityTimeline([newer], [older, middle])

    expect(
      timeline.map((item) => (item.type === 'comment' ? item.comment.id : item.entry.oid))
    ).toEqual(['newer', 'middle', 'older'])
  })

  it('tags each item with its type', () => {
    const timeline = buildActivityTimeline([comment()], [entry()])
    expect(timeline.map((item) => item.type).sort()).toEqual(['comment', 'history'])
  })

  it("resolves a reply's replyingToAuthor from its parent comment", () => {
    const parent = comment({ id: 'p1', author: 'Grace' })
    const reply = comment({ id: 'r1', author: 'Ada', parentCommentId: 'p1' })

    const timeline = buildActivityTimeline([parent, reply], [])

    const replyItem = timeline.find((item) => item.type === 'comment' && item.comment.id === 'r1')
    expect(replyItem?.type === 'comment' && replyItem.replyingToAuthor).toBe('Grace')
  })

  it('leaves replyingToAuthor undefined for a top-level comment', () => {
    const timeline = buildActivityTimeline([comment()], [])
    const item = timeline[0]
    expect(item.type === 'comment' && item.replyingToAuthor).toBeUndefined()
  })

  it("leaves replyingToAuthor undefined when the reply's parent isn't in the comment list", () => {
    const reply = comment({ id: 'r1', parentCommentId: 'missing' })
    const timeline = buildActivityTimeline([reply], [])
    const item = timeline[0]
    expect(item.type === 'comment' && item.replyingToAuthor).toBeUndefined()
  })
})
