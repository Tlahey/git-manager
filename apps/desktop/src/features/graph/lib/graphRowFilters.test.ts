import { describe, it, expect } from 'vitest'
import type { GitGraphNode } from '@git-manager/git-types'
import { matchCommitSearch, matchSelectedAuthors } from './graphRowFilters'

function node(oid: string, over: Partial<GitGraphNode['commit']> = {}): GitGraphNode {
  return {
    commit: {
      oid,
      subject: 'feat: add the thing',
      body: '',
      author: { name: 'Antoine', email: 'Antoine@Example.COM', timestamp: 0 },
      ...over,
    },
    column: 0,
    color: '#fff',
    refs: [],
    connections: [],
  } as unknown as GitGraphNode
}

const NODES = [
  node('aaa1', { subject: 'feat: rebase editor' }),
  node('bbb2', {
    subject: 'fix: graph lanes',
    author: { name: 'Bob', email: 'bob@x.io', timestamp: 0 },
  }),
  node('WIP'),
  node('CONFLICT'),
]

describe('matchCommitSearch', () => {
  /**
   * `null` means "no filter", and `GitGraph` dims a row only when a filter is active *and*
   * unmatched. Returning `[]` here would dim every row in the graph.
   */
  it('reports no filter at all for an empty or blank query', () => {
    expect(matchCommitSearch(NODES)).toBeNull()
    expect(matchCommitSearch(NODES, '   ')).toBeNull()
  })

  it('matches on the subject, case-insensitively', () => {
    expect(matchCommitSearch(NODES, 'REBASE')).toEqual(['aaa1'])
  })

  it('matches on the author and on the oid too', () => {
    expect(matchCommitSearch(NODES, 'bob@x.io')).toEqual(['bbb2'])
    expect(matchCommitSearch(NODES, 'aaa1')).toEqual(['aaa1'])
  })

  /** The synthetic rows have no commit to search, so they match on what they are. */
  it('finds the WIP and conflict rows by name', () => {
    expect(matchCommitSearch(NODES, 'wip')).toEqual(['WIP'])
    expect(matchCommitSearch(NODES, 'conflict')).toEqual(['CONFLICT'])
  })

  it('leaves the synthetic rows unmatched for any other query', () => {
    expect(matchCommitSearch(NODES, 'rebase')).not.toContain('WIP')
  })
})

describe('matchSelectedAuthors', () => {
  it('reports no filter when nothing is selected', () => {
    expect(matchSelectedAuthors(NODES, new Set())).toBeNull()
  })

  /** The stored emails are lowercased; a commit's own casing must not defeat the match. */
  it('matches the author email regardless of case', () => {
    expect(matchSelectedAuthors(NODES, new Set(['antoine@example.com']))).toContain('aaa1')
  })

  /**
   * A WIP or conflict row has no author. Dimming the user's own uncommitted work because they
   * filtered on somebody else reads as a bug rather than as a filter.
   */
  it('always keeps the synthetic rows, whoever is selected', () => {
    const kept = matchSelectedAuthors(NODES, new Set(['bob@x.io']))
    expect(kept).toEqual(expect.arrayContaining(['WIP', 'CONFLICT', 'bbb2']))
    expect(kept).not.toContain('aaa1')
  })
})
