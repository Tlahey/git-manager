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

describe('useGitGraphNodes — worktreeWipNodes (multiple simultaneous WIP rows)', () => {
  function branchRef(shortName: string, commitOid: string) {
    return { name: `refs/heads/${shortName}`, shortName, type: 'branch' as const, commitOid }
  }

  it('inserts a synthetic WIP:<path> row directly above the matching branch tip, offset one column with a fixed WIP color', () => {
    const nodes = [
      node('a', { column: 0, color: '#111' }),
      node('b', { column: 1, color: '#222', refs: [branchRef('feature-x', 'b')] }),
      node('c', { column: 0, color: '#111' }),
    ]
    const { result } = renderHook(() =>
      useGitGraphNodes(nodes, undefined, 0, t, null, [
        { path: '/wt/feature-x', branch: 'feature-x', totalChanges: 2 },
      ])
    )
    const oids = result.current.filteredNodes.map((n) => n.commit.oid)
    expect(oids).toEqual(['a', 'WIP:/wt/feature-x', 'b', 'c'])
    const wtNode = result.current.filteredNodes[1]
    expect(wtNode.column).toBe(2) // anchor's column (1) + 1, never the branch's own column
    expect(wtNode.color).toBe('#7c3aed') // fixed WIP color, never the branch's own color
    expect(wtNode.commit.parentOids).toEqual(['b'])
    // Own column only — the diagonal that actually reaches the anchor is patched onto the
    // anchor's row instead (see the "patches the anchor commit" test below).
    expect(wtNode.connections).toEqual([
      { fromColumn: 2, toColumn: 2, color: '#7c3aed', dashed: true },
    ])
  })

  it('carries over every active lane from the anchor — including its OWN column — as plain pass-throughs, so nothing shows a gap through the inserted row', () => {
    const nodes = [
      node('a', {
        column: 1,
        color: '#222',
        refs: [branchRef('feature-x', 'a')],
        // Column 0 (e.g. main) passes through untouched; column 1 is the anchor's own lane,
        // arriving at its real commit with `endsAtNode` — that flag must NOT leak into the
        // synthetic row above, which just needs a plain flow-through, not a node arrival.
        connections: [
          { fromColumn: 0, toColumn: 0, color: '#2563eb' },
          { fromColumn: 1, toColumn: 1, color: '#222', endsAtNode: true },
        ],
      }),
    ]
    const { result } = renderHook(() =>
      useGitGraphNodes(nodes, undefined, 0, t, null, [
        { path: '/wt/x', branch: 'feature-x', totalChanges: 1 },
      ])
    )
    const wtNode = result.current.filteredNodes[0]
    expect(wtNode.connections).toContainEqual({ fromColumn: 0, toColumn: 0, color: '#2563eb' })
    // The anchor's own column is carried over too, but stripped of `endsAtNode` — a plain
    // continuation, not an arrival, since no real commit sits in this synthetic row.
    expect(wtNode.connections).toContainEqual({ fromColumn: 1, toColumn: 1, color: '#222' })
    expect(wtNode.connections).toHaveLength(3) // both pass-throughs + its own column-2 WIP connector
  })

  it('supports several simultaneous worktree WIP rows on different branches, plus the primary WIP', () => {
    const nodes = [
      node('a', { column: 0, color: '#111' }),
      node('b', { column: 1, color: '#222', refs: [branchRef('feature-x', 'b')] }),
      node('c', { column: 2, color: '#333', refs: [branchRef('feature-y', 'c')] }),
    ]
    const { result } = renderHook(() =>
      useGitGraphNodes(nodes, undefined, 1, t, null, [
        { path: '/wt/x', branch: 'feature-x', totalChanges: 1 },
        { path: '/wt/y', branch: 'feature-y', totalChanges: 5 },
      ])
    )
    const oids = result.current.filteredNodes.map((n) => n.commit.oid)
    expect(oids).toEqual(['WIP', 'a', 'WIP:/wt/x', 'b', 'WIP:/wt/y', 'c'])
  })

  it('skips a worktree WIP status when no node carries a matching branch ref', () => {
    const nodes = [node('a')]
    const { result } = renderHook(() =>
      useGitGraphNodes(nodes, undefined, 0, t, null, [
        { path: '/wt/gone', branch: 'deleted-branch', totalChanges: 3 },
      ])
    )
    expect(result.current.filteredNodes.map((n) => n.commit.oid)).toEqual(['a'])
  })

  it('matches "wip" search against a worktree WIP row too', () => {
    const nodes = [node('a', { refs: [branchRef('feature-x', 'a')] })]
    const { result } = renderHook(() =>
      useGitGraphNodes(nodes, 'wi', 0, t, null, [
        { path: '/wt/x', branch: 'feature-x', totalChanges: 1 },
      ])
    )
    expect(result.current.matchingOids).toContain('WIP:/wt/x')
  })

  it('patches the anchor commit with a diagonal connector rising FROM its own row INTO the offset WIP column above — not a straight vertical', () => {
    const nodes = [node('a', { column: 2, color: '#456', refs: [branchRef('feature-x', 'a')] })]
    const { result } = renderHook(() =>
      useGitGraphNodes(nodes, undefined, 0, t, null, [
        { path: '/wt/x', branch: 'feature-x', totalChanges: 1 },
      ])
    )
    // index 1 = the anchor ("a"), right after its WIP row at index 0
    const anchor = result.current.renderNodes[1]
    // fromColumn (3) = the WIP row's offset column, toColumn (2) = the anchor's own column —
    // i.e. the line starts at the anchor's own row and rises into the WIP row, not the reverse.
    expect(
      anchor.connections.some(
        (c) => c.fromColumn === 3 && c.toColumn === 2 && c.dashed && c.color === '#7c3aed'
      )
    ).toBe(true)
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

  // Regression: a diamond `origin/main(b) → {p1, s1} → m` where the merge `m` is ahead of
  // origin/main. The merge's straight-down departure to its real first parent (the mainline
  // continuing below the merge dot) must stay SOLID, while the line arriving from above stays
  // dashed and the diagonal to the side branch stays solid. See useGitGraphNodes' originMainIndex
  // block and the matching Rust test `merge_row_ahead_of_origin_stays_solid_in_rust`.
  it("keeps a merge commit's first-parent departure solid while it is ahead of origin/main", () => {
    const nodes = [
      node('m', {
        column: 0,
        commit: { ...node('m').commit, parentOids: ['p1', 's1'] },
        connections: [
          { fromColumn: 0, toColumn: 0, color: '#2563eb', endsAtNode: true },
          { fromColumn: 0, toColumn: 0, color: '#2563eb', startsAtNode: true },
          { fromColumn: 0, toColumn: 1, color: '#7c3aed', startsAtNode: true },
        ],
      }),
      node('p1', {
        column: 0,
        commit: { ...node('p1').commit, parentOids: ['b'] },
        connections: [
          { fromColumn: 0, toColumn: 0, color: '#2563eb', endsAtNode: true },
          { fromColumn: 0, toColumn: 0, color: '#2563eb', startsAtNode: true },
          { fromColumn: 1, toColumn: 1, color: '#7c3aed' },
        ],
      }),
      node('s1', {
        column: 1,
        commit: { ...node('s1').commit, parentOids: ['b'] },
        connections: [
          { fromColumn: 0, toColumn: 0, color: '#2563eb' },
          { fromColumn: 1, toColumn: 1, color: '#7c3aed', endsAtNode: true },
          { fromColumn: 1, toColumn: 1, color: '#7c3aed', startsAtNode: true },
        ],
      }),
      node('b', {
        column: 0,
        refs: [
          {
            name: 'refs/remotes/origin/main',
            shortName: 'origin/main',
            type: 'remote',
            commitOid: 'b',
          },
        ],
        connections: [
          { fromColumn: 0, toColumn: 0, color: '#2563eb', endsAtNode: true },
          { fromColumn: 1, toColumn: 0, color: '#7c3aed' },
          { fromColumn: 0, toColumn: 0, color: '#2563eb', startsAtNode: true },
        ],
      }),
    ]
    const { result } = renderHook(() => useGitGraphNodes(nodes, undefined, 0, t, null))
    const merge = result.current.renderNodes[0]
    // The mainline segment BELOW the merge dot (its real first-parent link) stays solid.
    const departure = merge.connections.find(
      (c) => c.fromColumn === 0 && c.toColumn === 0 && c.startsAtNode
    )
    expect(departure?.dashed).toBeFalsy()
    // The line arriving from above (still ahead of origin) stays dashed.
    const arriving = merge.connections.find(
      (c) => c.fromColumn === 0 && c.toColumn === 0 && c.endsAtNode
    )
    expect(arriving?.dashed).toBe(true)
    // The diagonal to the side branch (already solid, not a column-0→0 edge) stays solid.
    const diagonal = merge.connections.find((c) => c.fromColumn === 0 && c.toColumn === 1)
    expect(diagonal?.dashed).toBeFalsy()
  })

  // Regression guard for the common case: a plain (single-parent) unpushed commit must still have
  // BOTH its arriving and its departing column-0 verticals dashed, so a straight run of unpushed
  // commits reads as one continuous dashed line — the merge exception above must not leak here.
  it('dashes both the arriving and the departing vertical of a plain unpushed commit', () => {
    const nodes = [
      node('a', {
        column: 0,
        commit: { ...node('a').commit, parentOids: ['b'] },
        connections: [
          { fromColumn: 0, toColumn: 0, color: '#2563eb', endsAtNode: true },
          { fromColumn: 0, toColumn: 0, color: '#2563eb', startsAtNode: true },
        ],
      }),
      node('b', {
        column: 0,
        refs: [
          {
            name: 'refs/remotes/origin/main',
            shortName: 'origin/main',
            type: 'remote',
            commitOid: 'b',
          },
        ],
        connections: [{ fromColumn: 0, toColumn: 0, color: '#2563eb', endsAtNode: true }],
      }),
    ]
    const { result } = renderHook(() => useGitGraphNodes(nodes, undefined, 0, t, null))
    const plain = result.current.renderNodes[0]
    const arriving = plain.connections.find((c) => c.endsAtNode)
    const departing = plain.connections.find((c) => c.startsAtNode)
    expect(arriving?.dashed).toBe(true)
    expect(departing?.dashed).toBe(true)
  })
})
