import { describe, it, expect } from 'vitest'
import type { GitGraphNode, GitRef } from '@git-manager/git-types'
import { isCommitHead } from './isCommitHead'

function node(oid: string, refs: Partial<GitRef>[] = []): GitGraphNode {
  return { commit: { oid }, refs } as unknown as GitGraphNode
}

const ref = (type: GitRef['type'], shortName = '', name = shortName) => ({ type, shortName, name })

describe('isCommitHead', () => {
  /** Strategy 1: the detached case, and the only unambiguous one. */
  it('recognises a commit carrying a HEAD ref, whatever the branch name says', () => {
    const detached = node('a', [ref('HEAD')])
    expect(isCommitHead(detached, [node('other'), detached], null)).toBe(true)
  })

  /** Strategy 2: the ordinary case — HEAD is at the tip of the checked-out branch. */
  it('recognises the commit carrying the checked-out branch', () => {
    const tip = node('b', [ref('branch', 'main', 'refs/heads/main')])
    expect(isCommitHead(tip, [node('newer'), tip], 'main')).toBe(true)
  })

  /** The branch is matched on either name — the caller's `headBranchName` may be qualified. */
  it('matches the branch on its short or its full name', () => {
    const tip = node('b', [ref('branch', 'main', 'refs/heads/main')])
    expect(isCommitHead(tip, [node('newer'), tip], 'refs/heads/main')).toBe(true)
  })

  /** Strategy 3: the log is walked from HEAD, so its first node is HEAD when nothing else says so. */
  it('falls back to the first node of the walk', () => {
    const first = node('c')
    expect(isCommitHead(first, [first, node('d')], null)).toBe(true)
  })

  it('rejects a plain commit further down the walk', () => {
    const deeper = node('d')
    expect(isCommitHead(deeper, [node('c'), deeper], 'main')).toBe(false)
  })

  /**
   * A WIP or CONFLICT row stands for uncommitted state, not for a commit — and it is *first* in the
   * walk, so without this guard the fallback above would report it as HEAD.
   */
  it('never reports a synthetic row as HEAD, first in the list or not', () => {
    const wip = node('WIP')
    expect(isCommitHead(wip, [wip, node('c')], 'main')).toBe(false)
    const conflict = node('CONFLICT')
    expect(isCommitHead(conflict, [conflict], 'main')).toBe(false)
  })

  it('reports nothing selected as not being HEAD', () => {
    expect(isCommitHead(null, [node('a')], 'main')).toBe(false)
  })
})
