import { describe, it, expect } from 'vitest'
import { buildPRSnapshot, buildPRSnapshotMap, snapshotMapsEqual } from './prSnapshots'
import type { MockPR } from '../github/types'

function pr(overrides: Partial<MockPR> = {}): MockPR {
  return {
    id: 'pr-1',
    number: 1,
    title: 'Add feature',
    repo: 'repo',
    repoUrl: 'https://github.com/org/repo',
    url: 'https://github.com/org/repo/pull/1',
    status: 'open',
    ciStatus: null,
    author: 'octocat',
    authorAvatar: '',
    collaborators: [],
    filesChanged: 1,
    additions: 1,
    deletions: 0,
    createdAt: new Date('2026-07-29T09:00:00Z'),
    updatedAt: new Date('2026-07-29T10:00:00Z'),
    reviewStatus: 'pending',
    isDraft: false,
    needsMyReview: false,
    labels: [],
    comments: 0,
    ...overrides,
  }
}

describe('buildPRSnapshot', () => {
  it('captures every field a notification can be raised on', () => {
    expect(buildPRSnapshot(pr({ status: 'merged', ciStatus: 'success', autoMerge: true }))).toEqual(
      {
        status: 'merged',
        reviewStatus: 'pending',
        needsMyReview: false,
        ciStatus: 'success',
        autoMerge: true,
        updatedAt: '2026-07-29T10:00:00.000Z',
      }
    )
  })

  it('normalizes the optional booleans so an absent flag never reads as a change', () => {
    const snap = buildPRSnapshot(pr())
    expect(snap.autoMerge).toBe(false)
    expect(snap.needsMyReview).toBe(false)
  })
})

describe('buildPRSnapshotMap', () => {
  it('keys snapshots by PR id', () => {
    const map = buildPRSnapshotMap([pr({ id: 'a' }), pr({ id: 'b', status: 'draft' })])
    expect(Object.keys(map).sort()).toEqual(['a', 'b'])
    expect(map.b.status).toBe('draft')
  })
})

describe('snapshotMapsEqual', () => {
  const base = buildPRSnapshotMap([pr({ id: 'a' })])

  it('is true for an identical poll', () => {
    expect(snapshotMapsEqual(base, buildPRSnapshotMap([pr({ id: 'a' })]))).toBe(true)
  })

  it('is false when a tracked field moved', () => {
    expect(snapshotMapsEqual(base, buildPRSnapshotMap([pr({ id: 'a', status: 'merged' })]))).toBe(
      false
    )
    expect(snapshotMapsEqual(base, buildPRSnapshotMap([pr({ id: 'a', autoMerge: true })]))).toBe(
      false
    )
    expect(
      snapshotMapsEqual(base, buildPRSnapshotMap([pr({ id: 'a', ciStatus: 'failure' })]))
    ).toBe(false)
  })

  it('is false when the set of PRs changed', () => {
    expect(snapshotMapsEqual(base, buildPRSnapshotMap([pr({ id: 'a' }), pr({ id: 'b' })]))).toBe(
      false
    )
    expect(snapshotMapsEqual(base, buildPRSnapshotMap([pr({ id: 'b' })]))).toBe(false)
  })

  it('treats an absent ciStatus and a null one as the same', () => {
    expect(snapshotMapsEqual({ a: { ...base.a, ciStatus: undefined } }, base)).toBe(true)
  })
})
