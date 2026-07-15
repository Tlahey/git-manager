import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { GitGraphNode } from '@git-manager/git-types'
import { useGitGraphNodes } from './useGitGraphNodes'

const NOW = Math.floor(Date.now() / 1000)

function node(oid: string, overrides: Partial<GitGraphNode> = {}): GitGraphNode {
  return {
    commit: {
      oid,
      shortOid: oid,
      message: `${oid} subject`,
      subject: `${oid} subject`,
      body: '',
      author: { name: 'Author', email: 'author@x.com', timestamp: NOW },
      committer: { name: 'Author', email: 'author@x.com', timestamp: NOW },
      parentOids: [],
    },
    column: 0,
    color: '#000',
    connections: [],
    refs: [],
    ...overrides,
  } as GitGraphNode
}

const t = (key: string) => key

describe('useGitGraphNodes — conflictNode / wipNode', () => {
  it('is null when there is no conflict info', () => {
    const { result } = renderHook(() => useGitGraphNodes([node('a')], undefined, 0, t, null))
    expect(result.current.conflictNode).toBeNull()
  })

  it('is null when there are no nodes, even with conflict info', () => {
    const { result } = renderHook(() => useGitGraphNodes([], undefined, 0, t, { count: 1 }))
    expect(result.current.conflictNode).toBeNull()
  })

  it('builds a synthetic CONFLICT node parented on the first commit', () => {
    const { result } = renderHook(() =>
      useGitGraphNodes([node('a')], undefined, 0, t, { count: 2 })
    )
    expect(result.current.conflictNode?.commit.oid).toBe('CONFLICT')
    expect(result.current.conflictNode?.commit.parentOids).toEqual(['a'])
  })

  it('builds a WIP node when there are pending changes and no conflict', () => {
    const { result } = renderHook(() => useGitGraphNodes([node('a')], undefined, 3, t, null))
    expect(result.current.wipNode?.commit.oid).toBe('WIP')
    expect(result.current.wipNode?.commit.parentOids).toEqual(['a'])
  })

  it('suppresses the WIP node when there are no pending changes', () => {
    const { result } = renderHook(() => useGitGraphNodes([node('a')], undefined, 0, t, null))
    expect(result.current.wipNode).toBeNull()
  })

  it('WIP and CONFLICT are mutually exclusive — conflict wins', () => {
    const { result } = renderHook(() =>
      useGitGraphNodes([node('a')], undefined, 3, t, { count: 1 })
    )
    expect(result.current.conflictNode).not.toBeNull()
    expect(result.current.wipNode).toBeNull()
  })
})

describe('useGitGraphNodes — filteredNodes (never removes rows)', () => {
  it('prepends the special node (WIP) to the list when present', () => {
    const { result } = renderHook(() => useGitGraphNodes([node('a')], undefined, 1, t, null))
    expect(result.current.filteredNodes.map((n) => n.commit.oid)).toEqual(['WIP', 'a'])
  })

  it('returns every node when there is no search query', () => {
    const nodes = [node('a'), node('b')]
    const { result } = renderHook(() => useGitGraphNodes(nodes, '', 0, t, null))
    expect(result.current.filteredNodes).toHaveLength(2)
  })

  it('keeps every node even when the search query matches nothing', () => {
    const nodes = [node('a'), node('b')]
    const { result } = renderHook(() => useGitGraphNodes(nodes, 'nomatch', 0, t, null))
    expect(result.current.filteredNodes.map((n) => n.commit.oid)).toEqual(['a', 'b'])
  })
})

describe('useGitGraphNodes — matchingOids', () => {
  it('is null when there is no search query', () => {
    const { result } = renderHook(() => useGitGraphNodes([node('a')], '', 0, t, null))
    expect(result.current.matchingOids).toBeNull()
  })

  it('is null when the search query is undefined', () => {
    const { result } = renderHook(() => useGitGraphNodes([node('a')], undefined, 0, t, null))
    expect(result.current.matchingOids).toBeNull()
  })

  it('matches by commit subject/body/author/oid, case-insensitively', () => {
    const nodes = [
      node('a', { commit: { ...node('a').commit, subject: 'Fix the bug' } }),
      node('b'),
    ]
    const { result } = renderHook(() => useGitGraphNodes(nodes, 'FIX THE', 0, t, null))
    expect(result.current.matchingOids).toEqual(['a'])
  })

  it('is an empty array when the search query matches nothing', () => {
    const nodes = [node('a'), node('b')]
    const { result } = renderHook(() => useGitGraphNodes(nodes, 'nomatch', 0, t, null))
    expect(result.current.matchingOids).toEqual([])
  })

  it('matches "wip" against the synthetic WIP row', () => {
    const { result } = renderHook(() => useGitGraphNodes([node('a')], 'wi', 1, t, null))
    expect(result.current.matchingOids).toEqual(['WIP'])
  })

  it('matches "conflict" against the synthetic CONFLICT row', () => {
    const { result } = renderHook(() => useGitGraphNodes([node('a')], 'confl', 0, t, { count: 1 }))
    expect(result.current.matchingOids).toEqual(['CONFLICT'])
  })

  it('trims and ignores case in the search query', () => {
    const nodes = [node('a')]
    const { result } = renderHook(() => useGitGraphNodes(nodes, '  A SUBJECT  ', 0, t, null))
    expect(result.current.matchingOids).toEqual(['a'])
  })
})

describe('useGitGraphNodes — waterlines', () => {
  it('never emits a waterline at index 0', () => {
    const oldTimestamp = NOW - 400 * 86400
    const nodes = [
      node('a', {
        commit: { ...node('a').commit, author: { name: '', email: '', timestamp: oldTimestamp } },
      }),
    ]
    const { result } = renderHook(() => useGitGraphNodes(nodes, undefined, 0, t, null))
    expect(result.current.waterlines).toEqual([])
  })

  it('emits a waterline mark when crossing into an older bucket', () => {
    const today = node('a')
    const oldOne = node('b', {
      commit: {
        ...node('b').commit,
        author: { name: '', email: '', timestamp: NOW - 400 * 86400 },
      },
    })
    const { result } = renderHook(() => useGitGraphNodes([today, oldOne], undefined, 0, t, null))
    expect(result.current.waterlines).toHaveLength(1)
    expect(result.current.waterlines[0].index).toBe(1)
  })

  it('does not emit duplicate waterlines for commits in the same bucket', () => {
    const oldA = node('a', {
      commit: {
        ...node('a').commit,
        author: { name: '', email: '', timestamp: NOW - 400 * 86400 },
      },
    })
    const oldB = node('b', {
      commit: {
        ...node('b').commit,
        author: { name: '', email: '', timestamp: NOW - 400 * 86400 },
      },
    })
    const { result } = renderHook(() => useGitGraphNodes([oldA, oldB], undefined, 0, t, null))
    expect(result.current.waterlines).toEqual([])
  })
})

describe('useGitGraphNodes — originMainIndex', () => {
  it('finds the index of the origin/main ref', () => {
    const nodes = [
      node('a'),
      node('b', {
        refs: [
          {
            name: 'refs/remotes/origin/main',
            shortName: 'origin/main',
            type: 'remote',
            commitOid: 'b',
          },
        ],
      }),
    ]
    // totalChanges: 0 and conflictInfo: null — no special node prepended, so filteredNodes === nodes.
    const { result } = renderHook(() => useGitGraphNodes(nodes, undefined, 0, t, null))
    expect(result.current.originMainIndex).toBe(1)
  })

  it('returns -1 when no node carries the origin/main or origin/master ref', () => {
    const { result } = renderHook(() => useGitGraphNodes([node('a')], undefined, 0, t, null))
    expect(result.current.originMainIndex).toBe(-1)
  })
})

describe('useGitGraphNodes — renderNodes patching', () => {
  it('adds a dashed WIP connector at index 1 when there are pending changes and no existing column-0 link', () => {
    const nodes = [node('a'), node('b')]
    const { result } = renderHook(() => useGitGraphNodes(nodes, undefined, 1, t, null))
    // index 1 in filteredNodes is nodes[0] ("a"), since WIP occupies index 0
    const patchedNode = result.current.renderNodes[1]
    expect(
      patchedNode.connections.some((c) => c.fromColumn === 0 && c.toColumn === 0 && c.dashed)
    ).toBe(true)
  })

  it('does not duplicate an already-existing column-0 connector', () => {
    const nodes = [
      node('a', { connections: [{ fromColumn: 0, toColumn: 0, color: '#123', dashed: false }] }),
      node('b'),
    ]
    const { result } = renderHook(() => useGitGraphNodes(nodes, undefined, 1, t, null))
    const patchedNode = result.current.renderNodes[1]
    expect(patchedNode.connections).toHaveLength(1)
  })

  it('marks connections up to and including originMainIndex as dashed', () => {
    const nodes = [
      node('a', { connections: [{ fromColumn: 0, toColumn: 0, color: '#123', dashed: false }] }),
      node('b', {
        connections: [{ fromColumn: 0, toColumn: 0, color: '#123', dashed: false }],
        refs: [
          {
            name: 'refs/remotes/origin/main',
            shortName: 'origin/main',
            type: 'remote',
            commitOid: 'b',
          },
        ],
      }),
    ]
    const { result } = renderHook(() => useGitGraphNodes(nodes, undefined, 0, t, null))
    for (const n of result.current.renderNodes) {
      const col0 = n.connections.find((c) => c.fromColumn === 0 && c.toColumn === 0)
      if (col0) expect(col0.dashed).toBe(true)
    }
  })
})
