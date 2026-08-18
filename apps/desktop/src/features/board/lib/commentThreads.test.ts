import { describe, it, expect } from 'vitest'
import type { BoardComment } from '@git-manager/git-types'
import { buildCommentThreads } from './commentThreads'

function comment(overrides: Partial<BoardComment> = {}): BoardComment {
  return {
    id: 'k1',
    author: 'Ada',
    body: 'Looks good',
    createdAt: '2026-08-01T09:00:00.000Z',
    ...overrides,
  }
}

describe('buildCommentThreads', () => {
  it('is empty for no comments', () => {
    expect(buildCommentThreads([])).toEqual([])
  })

  it('orders top-level comments newest first', () => {
    const older = comment({ id: 'a', createdAt: '2026-08-01T09:00:00.000Z' })
    const newer = comment({ id: 'b', createdAt: '2026-08-02T09:00:00.000Z' })

    const threads = buildCommentThreads([older, newer])

    expect(threads.map((node) => node.comment.id)).toEqual(['b', 'a'])
  })

  it('nests a reply under its parent', () => {
    const parent = comment({ id: 'p1', createdAt: '2026-08-01T09:00:00.000Z' })
    const reply = comment({
      id: 'r1',
      parentCommentId: 'p1',
      createdAt: '2026-08-02T09:00:00.000Z',
    })

    const threads = buildCommentThreads([parent, reply])

    expect(threads).toHaveLength(1)
    expect(threads[0].comment.id).toBe('p1')
    expect(threads[0].children.map((node) => node.comment.id)).toEqual(['r1'])
  })

  it('nests a reply to a reply at arbitrary depth', () => {
    const root = comment({ id: 'p1', createdAt: '2026-08-01T09:00:00.000Z' })
    const reply = comment({
      id: 'r1',
      parentCommentId: 'p1',
      createdAt: '2026-08-02T09:00:00.000Z',
    })
    const replyToReply = comment({
      id: 'r2',
      parentCommentId: 'r1',
      createdAt: '2026-08-03T09:00:00.000Z',
    })

    const threads = buildCommentThreads([root, reply, replyToReply])

    expect(threads).toHaveLength(1)
    expect(threads[0].children[0].comment.id).toBe('r1')
    expect(threads[0].children[0].children[0].comment.id).toBe('r2')
  })

  it('renders a comment with an unknown parent id as a root rather than dropping it', () => {
    const orphan = comment({ id: 'o1', parentCommentId: 'does-not-exist' })

    const threads = buildCommentThreads([orphan])

    expect(threads.map((node) => node.comment.id)).toEqual(['o1'])
  })

  it('renders a self-referencing comment as a root rather than infinite-looping', () => {
    const selfRef = comment({ id: 's1', parentCommentId: 's1' })

    const threads = buildCommentThreads([selfRef])

    expect(threads.map((node) => node.comment.id)).toEqual(['s1'])
  })

  it('terminates rather than hanging on a fabricated cycle between two comments', () => {
    const a = comment({ id: 'a', parentCommentId: 'b' })
    const b = comment({ id: 'b', parentCommentId: 'a' })

    // Both point at a real parent, so the grouping pass never treats either as a root, and neither
    // ends up traversed — the pair simply produces no thread rather than hanging. This is the
    // structural reason the cycle can never overflow the stack: only the `visited` guard on the
    // self-referencing case (above) can actually be reached during a real traversal.
    expect(() => buildCommentThreads([a, b])).not.toThrow()
    expect(buildCommentThreads([a, b])).toEqual([])
  })
})
