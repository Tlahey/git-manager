import { describe, it, expect } from 'vitest'
import type { GitGraphNode } from '@git-manager/git-types'
import { collectGraphAuthors } from './graphAuthors'

const NOW = Math.floor(Date.now() / 1000)

function node(oid: string, name: string, email: string): GitGraphNode {
  return {
    commit: {
      oid,
      shortOid: oid,
      message: `${oid} subject`,
      subject: `${oid} subject`,
      body: '',
      author: { name, email, timestamp: NOW },
      committer: { name, email, timestamp: NOW },
      parentOids: [],
    },
    column: 0,
    color: '#000',
    connections: [],
    refs: [],
  } as GitGraphNode
}

describe('collectGraphAuthors', () => {
  it('dedupes by lowercased email and counts commits', () => {
    const authors = collectGraphAuthors([
      node('a', 'Alice', 'alice@x.com'),
      node('b', 'Alice', 'ALICE@x.com'),
      node('c', 'Bob', 'bob@x.com'),
    ])
    expect(authors).toEqual([
      { email: 'alice@x.com', name: 'Alice', count: 2 },
      { email: 'bob@x.com', name: 'Bob', count: 1 },
    ])
  })

  it('sorts by count desc then name (locale)', () => {
    const authors = collectGraphAuthors([
      node('a', 'Zoe', 'zoe@x.com'),
      node('b', 'Amy', 'amy@x.com'),
      node('c', 'Amy', 'amy@x.com'),
      node('d', 'Bob', 'bob@x.com'),
      node('e', 'Bob', 'bob@x.com'),
    ])
    // Amy(2) and Bob(2) tie on count → alphabetical; Zoe(1) last.
    expect(authors.map((a) => a.name)).toEqual(['Amy', 'Bob', 'Zoe'])
  })

  it('skips synthetic WIP / CONFLICT / worktree-WIP rows', () => {
    const authors = collectGraphAuthors([
      node('WIP', '', ''),
      node('CONFLICT', '', ''),
      node('WIP:/tmp/wt', '', ''),
      node('a', 'Alice', 'alice@x.com'),
    ])
    expect(authors).toEqual([{ email: 'alice@x.com', name: 'Alice', count: 1 }])
  })

  it('skips real commits that have no email', () => {
    const authors = collectGraphAuthors([node('a', 'NoEmail', '  ')])
    expect(authors).toEqual([])
  })

  it('falls back to the email as name when the name is empty', () => {
    const authors = collectGraphAuthors([node('a', '', 'ghost@x.com')])
    expect(authors).toEqual([{ email: 'ghost@x.com', name: 'ghost@x.com', count: 1 }])
  })

  it('backfills a name from a later commit when the first sighting had none', () => {
    const authors = collectGraphAuthors([
      node('a', '', 'dev@x.com'),
      node('b', 'Dev', 'dev@x.com'),
    ])
    expect(authors).toEqual([{ email: 'dev@x.com', name: 'Dev', count: 2 }])
  })
})
