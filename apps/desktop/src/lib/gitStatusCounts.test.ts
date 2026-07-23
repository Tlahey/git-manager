import { describe, it, expect } from 'vitest'
import type { GitStatus } from '@git-manager/git-types'
import { countChanges, bucketChanges } from './gitStatusCounts'

function makeStatus(partial: Partial<GitStatus>): GitStatus {
  return {
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
    ...partial,
  }
}

describe('countChanges', () => {
  it('sums every bucket', () => {
    const status = makeStatus({
      staged: [{ path: 'a', status: 'modified' }],
      unstaged: [{ path: 'b', status: 'deleted' }],
      untracked: ['c'],
      conflicted: ['d'],
    })
    expect(countChanges(status)).toBe(4)
  })

  it('is zero for a clean tree', () => {
    expect(countChanges(makeStatus({}))).toBe(0)
  })
})

describe('bucketChanges', () => {
  it('counts untracked as added', () => {
    expect(bucketChanges(makeStatus({ untracked: ['x', 'y'] }))).toEqual({
      added: 2,
      modified: 0,
      deleted: 0,
    })
  })

  it('buckets staged and unstaged entries by kind', () => {
    const status = makeStatus({
      staged: [
        { path: 'a', status: 'added' },
        { path: 'b', status: 'renamed' },
      ],
      unstaged: [
        { path: 'c', status: 'deleted' },
        { path: 'd', status: 'typechange' },
      ],
      untracked: ['e'],
    })
    // added: 1 untracked + 1 staged 'added' = 2; modified: renamed + typechange = 2; deleted: 1
    expect(bucketChanges(status)).toEqual({ added: 2, modified: 2, deleted: 1 })
  })
})
