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

  it('inserts a synthetic WIP:<path> row directly above the matching branch tip, using the branch column when it is the first/only WIP', () => {
    const nodes = [
      node('a', { column: 0, color: '#111' }),
      node('b', { column: 1, color: '#222', refs: [branchRef('feature-x', 'b')] }),
      node('c', { column: 0, color: '#111' }),
    ]
    const { result } = renderHook(() =>
      useGitGraphNodes(nodes, undefined, 0, t, null, [
        { path: '/wt/feature-x', branch: 'feature-x', totalChanges: 2, added: 0, modified: 0, deleted: 0 },
      ])
    )
    const oids = result.current.filteredNodes.map((n) => n.commit.oid)
    expect(oids).toEqual(['a', 'WIP:/wt/feature-x', 'b', 'c'])
    const wtNode = result.current.filteredNodes[1]
    expect(wtNode.column).toBe(1) // anchor's column (1), since it is the first/only WIP
    expect(wtNode.color).toBe('#7c3aed') // fixed WIP color, never the branch's own color
    expect(wtNode.commit.parentOids).toEqual(['b'])
    // Own column only
    expect(wtNode.connections).toEqual([
      { fromColumn: 1, toColumn: 1, color: '#7c3aed', dashed: true },
    ])
  })

  it('offsets off the anchor lane when a line crosses above it, carrying every through-lane as a plain pass-through', () => {
    const nodes = [
      node('a', {
        column: 1,
        color: '#222',
        refs: [branchRef('feature-x', 'a')],
        // Column 0 (e.g. main) passes through untouched; column 1 is the anchor's own lane, but a
        // line ARRIVES at it from above (`endsAtNode`) — a merged feature tip whose merge sits
        // above. So the WIP must NOT sit on column 1 (it would land on that incoming line); it
        // offsets to the first free lane (2), and both crossing lanes flow through as plain
        // pass-throughs (the `endsAtNode` flag never leaks into the synthetic row).
        connections: [
          { fromColumn: 0, toColumn: 0, color: '#2563eb' },
          { fromColumn: 1, toColumn: 1, color: '#222', endsAtNode: true },
        ],
      }),
    ]
    const { result } = renderHook(() =>
      useGitGraphNodes(nodes, undefined, 0, t, null, [
        { path: '/wt/x', branch: 'feature-x', totalChanges: 1, added: 0, modified: 0, deleted: 0 },
      ])
    )
    const wtNode = result.current.filteredNodes[0]
    expect(wtNode.column).toBe(2) // offset off the occupied anchor lane (1)
    expect(wtNode.connections).toContainEqual({ fromColumn: 0, toColumn: 0, color: '#2563eb' })
    expect(wtNode.connections).toContainEqual({ fromColumn: 1, toColumn: 1, color: '#222' })
    expect(wtNode.connections).toContainEqual({ fromColumn: 2, toColumn: 2, color: '#7c3aed', dashed: true })
    expect(wtNode.connections).toHaveLength(3)
  })

  it('continues a lane that merges diagonally INTO the anchor as a straight vertical (merge-commit anchor)', () => {
    // Regression: the anchor is a merge commit. A branch merging into it arrives as a *diagonal*
    // edge (fromColumn 2 → toColumn 0, the anchor's own column). The old copy only kept
    // `fromColumn === toColumn` verticals, so that incoming lane was dropped and its line was cut
    // at the inserted WIP row (the reported "ligne verte coupée" at the WIP-33 row). It must now
    // flow straight up through the synthetic row at its own column (2), keeping its color.
    const nodes = [
      node('m', {
        column: 0,
        color: '#16a34a',
        refs: [branchRef('feature-x', 'm')],
        commit: { ...node('m').commit, parentOids: ['p1', 's1'] },
        connections: [
          { fromColumn: 0, toColumn: 0, color: '#16a34a', endsAtNode: true },
          { fromColumn: 0, toColumn: 0, color: '#16a34a', startsAtNode: true },
          { fromColumn: 2, toColumn: 0, color: '#0891b2' }, // side branch merging in (diagonal)
        ],
      }),
    ]
    const { result } = renderHook(() =>
      useGitGraphNodes(nodes, undefined, 0, t, null, [
        { path: '/wt/x', branch: 'feature-x', totalChanges: 33, added: 0, modified: 0, deleted: 0 },
      ])
    )
    const wtNode = result.current.filteredNodes[0]
    // The diagonally-merging lane keeps flowing up at its own column, no longer cut.
    expect(wtNode.connections).toContainEqual({ fromColumn: 2, toColumn: 2, color: '#0891b2' })
    // The anchor's own column 0 has a line arriving from above (`endsAtNode`), so it's occupied:
    // the WIP offsets to column 1, and column 0 flows through as a plain mainline pass-through.
    expect(wtNode.column).toBe(1)
    expect(wtNode.connections).toContainEqual({ fromColumn: 0, toColumn: 0, color: '#16a34a' })
    expect(wtNode.connections).toContainEqual({ fromColumn: 1, toColumn: 1, color: '#7c3aed', dashed: true })
    const col0 = wtNode.connections.filter((c) => c.fromColumn === 0 && c.toColumn === 0)
    expect(col0).toHaveLength(1)
  })

  it('skips a lane already occupied at the anchor row instead of landing on top of it when multiple WIPs are present', () => {
    // Anchor at column 1 with another branch's lane already passing through at column 2.
    // If we have both primary WIP and worktree WIP, the primary WIP takes column 1, and the
    // worktree WIP row must move to the first free lane (column 3), never sit on the occupied column 2,
    // and it must carry column 2's pass-through so that lane keeps flowing through this row.
    const nodes = [
      node('a', {
        column: 1,
        color: '#222',
        refs: [branchRef('feature-x', 'a')],
        connections: [
          { fromColumn: 0, toColumn: 0, color: '#2563eb' },
          { fromColumn: 1, toColumn: 1, color: '#222', endsAtNode: true },
          { fromColumn: 2, toColumn: 2, color: '#16a34a' },
        ],
      }),
    ]
    const { result } = renderHook(() =>
      useGitGraphNodes(nodes, undefined, 1, t, null, [
        { path: '/wt/x', branch: 'feature-x', totalChanges: 1, added: 0, modified: 0, deleted: 0 },
      ])
    )
    const wtNode = result.current.filteredNodes[1] // index 0 is primary WIP, index 1 is worktree WIP
    expect(wtNode.column).toBe(3) // not the occupied column 2
    // The occupied lane keeps flowing through the inserted row (no gap / no décalage).
    expect(wtNode.connections).toContainEqual({ fromColumn: 2, toColumn: 2, color: '#16a34a' })
    // Own dashed connector sits on the free lane, out of every other line's path.
    expect(wtNode.connections).toContainEqual({
      fromColumn: 3,
      toColumn: 3,
      color: '#7c3aed',
      dashed: true,
    })
    // The anchor's rising diagonal targets the same free lane.
    const anchor = result.current.renderNodes[2]
    expect(
      anchor.connections.some((c) => c.fromColumn === 3 && c.toColumn === 1 && c.dashed)
    ).toBe(true)
  })

  it('supports several simultaneous worktree WIP rows on different branches, plus the primary WIP', () => {
    const nodes = [
      node('a', { column: 0, color: '#111' }),
      node('b', { column: 1, color: '#222', refs: [branchRef('feature-x', 'b')] }),
      node('c', { column: 2, color: '#333', refs: [branchRef('feature-y', 'c')] }),
    ]
    const { result } = renderHook(() =>
      useGitGraphNodes(nodes, undefined, 1, t, null, [
        { path: '/wt/x', branch: 'feature-x', totalChanges: 1, added: 0, modified: 0, deleted: 0 },
        { path: '/wt/y', branch: 'feature-y', totalChanges: 5, added: 0, modified: 0, deleted: 0 },
      ])
    )
    const oids = result.current.filteredNodes.map((n) => n.commit.oid)
    expect(oids).toEqual(['WIP', 'a', 'WIP:/wt/x', 'b', 'WIP:/wt/y', 'c'])
  })

  it('skips a worktree WIP status when no node carries a matching branch ref', () => {
    const nodes = [node('a')]
    const { result } = renderHook(() =>
      useGitGraphNodes(nodes, undefined, 0, t, null, [
        { path: '/wt/gone', branch: 'deleted-branch', totalChanges: 3, added: 0, modified: 0, deleted: 0 },
      ])
    )
    expect(result.current.filteredNodes.map((n) => n.commit.oid)).toEqual(['a'])
  })

  it('matches "wip" search against a worktree WIP row too', () => {
    const nodes = [node('a', { refs: [branchRef('feature-x', 'a')] })]
    const { result } = renderHook(() =>
      useGitGraphNodes(nodes, 'wi', 0, t, null, [
        { path: '/wt/x', branch: 'feature-x', totalChanges: 1, added: 0, modified: 0, deleted: 0 },
      ])
    )
    expect(result.current.matchingOids).toContain('WIP:/wt/x')
  })

  it('patches the anchor commit with a diagonal connector rising FROM its own row INTO the offset WIP column above — not a straight vertical', () => {
    const nodes = [node('a', { column: 2, color: '#456', refs: [branchRef('feature-x', 'a')] })]
    const { result } = renderHook(() =>
      useGitGraphNodes(nodes, undefined, 1, t, null, [
        { path: '/wt/x', branch: 'feature-x', totalChanges: 1, added: 0, modified: 0, deleted: 0 },
      ])
    )
    // index 2 = the anchor ("a"), right after primary WIP (index 0) and its worktree WIP row at index 1
    const anchor = result.current.renderNodes[2]
    // fromColumn (3) = the WIP row's offset column, toColumn (2) = the anchor's own column —
    // i.e. the line starts at the anchor's own row and rises into the WIP row, not the reverse.
    expect(
      anchor.connections.some(
        (c) => c.fromColumn === 3 && c.toColumn === 2 && c.dashed && c.color === '#7c3aed'
      )
    ).toBe(true)
  })
})

describe('useGitGraphNodes — worktree WIP on a merged feature tip (occupied lane)', () => {
  const WIP = '#7c3aed'
  const branchRef = (s: string, oid: string) => ({
    name: `refs/heads/${s}`,
    shortName: s,
    type: 'branch' as const,
    commitOid: oid,
  })

  // Screenshot bug: the branch tip was already merged, so the merge commit above leaves an
  // incoming line on the tip's OWN lane. Placing the WIP there draws it on top of that branch
  // line — it must offset to a free lane while the branch line flows through unbroken.
  function renderScenario() {
    const nodes = [
      node('merge', {
        column: 0,
        color: '#2563eb',
        commit: { ...node('merge').commit, parentOids: ['prev', 'feat'] },
        connections: [
          { fromColumn: 0, toColumn: 0, color: '#2563eb', startsAtNode: true },
          { fromColumn: 0, toColumn: 1, color: '#16a34a', startsAtNode: true }, // diagonal down to the feature tip
        ],
      }),
      node('feat', {
        column: 1,
        color: '#16a34a',
        refs: [branchRef('feat-x', 'feat')],
        connections: [
          { fromColumn: 1, toColumn: 1, color: '#16a34a', endsAtNode: true }, // merge's line arrives from above
          { fromColumn: 1, toColumn: 1, color: '#16a34a', startsAtNode: true },
        ],
      }),
      node('older', { column: 0, connections: [{ fromColumn: 0, toColumn: 0, color: '#2563eb' }] }),
    ]
    return renderHook(() =>
      useGitGraphNodes(nodes, undefined, 0, t, null, [
        { path: '/wt', branch: 'feat-x', totalChanges: 1, added: 0, modified: 1, deleted: 0 },
      ])
    )
  }

  it('offsets the WIP off the occupied feature-tip lane', () => {
    const { result } = renderScenario()
    const wip = result.current.filteredNodes[1]
    expect(wip.commit.oid).toBe('WIP:/wt')
    expect(wip.column).toBe(2) // not the tip's own lane (1), which the merge line occupies
  })

  it('keeps the feature branch line flowing through the WIP row unbroken', () => {
    const { result } = renderScenario()
    const wip = result.current.filteredNodes[1]
    // The green lane (column 1) passes straight through as a plain pass-through…
    expect(wip.connections).toContainEqual({ fromColumn: 1, toColumn: 1, color: '#16a34a' })
    // …and the WIP's own dashed connector sits on its offset lane.
    expect(wip.connections).toContainEqual({ fromColumn: 2, toColumn: 2, color: WIP, dashed: true })
  })

  it('links the WIP to the tip via a diagonal from its offset lane', () => {
    const { result } = renderScenario()
    const feat = result.current.renderNodes[2]
    expect(feat.connections).toContainEqual(
      expect.objectContaining({ fromColumn: 2, toColumn: 1, dashed: true, endsAtNode: true })
    )
  })
})

describe('useGitGraphNodes — several worktree WIP rows stacked on one shared anchor', () => {
  const WIP = '#7c3aed' // fixed WIP-row color (see WIP_COLOR in the hook)
  function branchRef(shortName: string, commitOid: string) {
    return { name: `refs/heads/${shortName}`, shortName, type: 'branch' as const, commitOid }
  }

  // Real-world shape from the screenshot: several branches all point at main's tip, each with a
  // dirty linked worktree, so their "// WIP" rows stack directly above that one commit.
  function renderScenario(primaryChanges = 0) {
    const nodes = [
      node('mainTip', {
        column: 0,
        color: '#2563eb',
        refs: [
          { name: 'HEAD', shortName: 'HEAD', type: 'HEAD' as const, commitOid: 'mainTip' },
          branchRef('main', 'mainTip'),
          branchRef('feat-a', 'mainTip'),
          branchRef('feat-b', 'mainTip'),
        ],
        commit: { ...node('mainTip').commit, parentOids: ['older'] },
        connections: [{ fromColumn: 0, toColumn: 0, color: '#2563eb', startsAtNode: true }],
      }),
      node('older', { column: 0, connections: [{ fromColumn: 0, toColumn: 0, color: '#2563eb' }] }),
    ]
    return renderHook(() =>
      useGitGraphNodes(nodes, undefined, primaryChanges, t, null, [
        { path: '/wt-a', branch: 'feat-a', totalChanges: 15, added: 0, modified: 0, deleted: 0 },
        { path: '/wt-b', branch: 'feat-b', totalChanges: 1, added: 0, modified: 0, deleted: 0 },
      ])
    )
  }

  it('puts the topmost WIP row on the anchor lane and offsets the next one', () => {
    const { result } = renderScenario()
    const rows = result.current.filteredNodes.map((n) => ({ oid: n.commit.oid, col: n.column }))
    // wt-b is spliced on top (later status), so it takes main's own lane (0); wt-a offsets.
    expect(rows).toEqual([
      { oid: 'WIP:/wt-b', col: 0 },
      { oid: 'WIP:/wt-a', col: 1 },
      { oid: 'mainTip', col: 0 },
      { oid: 'older', col: 0 },
    ])
  })

  it('runs the top WIP connector straight down its lane to the anchor, unbroken', () => {
    const { result } = renderScenario()
    const [wtB, wtA, mainTip] = result.current.renderNodes
    // wt-b's own dashed vertical on column 0…
    expect(wtB.connections).toContainEqual({ fromColumn: 0, toColumn: 0, color: WIP, dashed: true })
    // …carried through the WIP row spliced between it and the anchor (no row-tall gap)…
    expect(wtA.connections).toContainEqual({ fromColumn: 0, toColumn: 0, color: WIP, dashed: true })
    // …arriving at the anchor node center (this is the connector the old syntheticIndex+1 patch
    // dropped, leaving the top WIP linked to nothing).
    expect(mainTip.connections).toContainEqual({
      fromColumn: 0,
      toColumn: 0,
      color: WIP,
      dashed: true,
      endsAtNode: true,
    })
  })

  it('patches the shared anchor with one arriving connector per stacked WIP row', () => {
    const { result } = renderScenario()
    const mainTip = result.current.renderNodes[2]
    // straight vertical for the on-lane top WIP…
    expect(mainTip.connections).toContainEqual(
      expect.objectContaining({ fromColumn: 0, toColumn: 0, dashed: true, endsAtNode: true })
    )
    // …and the offset WIP's rising diagonal.
    expect(mainTip.connections).toContainEqual(
      expect.objectContaining({ fromColumn: 1, toColumn: 0, dashed: true, endsAtNode: true })
    )
  })

  it('keeps the primary WIP on the anchor lane and offsets the worktree WIPs when the repo is dirty too', () => {
    const { result } = renderScenario(5)
    const rows = result.current.filteredNodes.map((n) => ({ oid: n.commit.oid, col: n.column }))
    // The editable primary WIP is prepended on main's lane; the worktree WIPs offset off it.
    expect(rows[0]).toEqual({ oid: 'WIP', col: 0 })
    const worktreeCols = rows.filter((r) => r.oid.startsWith('WIP:')).map((r) => r.col)
    expect(worktreeCols.every((c) => c > 0)).toBe(true)
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

  it('links the WIP row to a top merge commit whose only column-0 edge departs downward', () => {
    // A merge at the very top of a fresh lane (e.g. a feature branch) has just a `startsAtNode`
    // column-0 edge (its straight line down to the first parent) plus a diagonal to the second
    // parent — nothing arriving from the top. That departure must NOT count as "already linked",
    // or the WIP circle above floats disconnected. Regression for the missing merge↔WIP link.
    const nodes = [
      node('m', {
        column: 0,
        commit: { ...node('m').commit, parentOids: ['p1', 's1'] },
        connections: [
          { fromColumn: 0, toColumn: 0, color: '#111', startsAtNode: true },
          { fromColumn: 0, toColumn: 1, color: '#222', startsAtNode: true },
        ],
      }),
      node('p1', { column: 0 }),
    ]
    const { result } = renderHook(() => useGitGraphNodes(nodes, undefined, 1, t, null))
    const merge = result.current.renderNodes[1] // index 0 is the WIP row
    const wipLink = merge.connections.find(
      (c) => c.fromColumn === 0 && c.toColumn === 0 && c.dashed
    )
    expect(wipLink).toBeDefined()
    expect(wipLink?.endsAtNode).toBe(true) // reaches the node center, not a floating stub
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

  // Regression (real-repo repro): local main is checked out but BEHIND origin/main. Column 0 is
  // the lane reserved for local main, while origin/main's tip — the display-first commit — sits
  // on column 1. The WIP row's connector must anchor on the first real commit rendered ON its own
  // column (the local main node several rows down), NOT merely the first real commit in display
  // order: none of the rows in between has a node on column 0, so every column-0 segment crossing
  // them stays dashed, and the line only turns solid at (and below) the local main node itself.
  it('keeps the WIP lane dashed down to the first real commit on its own column when local main is behind origin/main', () => {
    const nodes = [
      node('remoteTip', {
        column: 1,
        commit: { ...node('remoteTip').commit, parentOids: ['mid', 'x'] },
        refs: [
          {
            name: 'refs/remotes/origin/main',
            shortName: 'origin/main',
            type: 'remote',
            commitOid: 'remoteTip',
          },
        ],
        connections: [
          { fromColumn: 0, toColumn: 0, color: '#2563eb' }, // reserved local-main lane passing through
          { fromColumn: 1, toColumn: 1, color: '#7c3aed', startsAtNode: true },
        ],
      }),
      node('mid', {
        column: 1,
        commit: { ...node('mid').commit, parentOids: ['localMain'] },
        connections: [
          { fromColumn: 0, toColumn: 0, color: '#2563eb' }, // still passing through, no node contact
          { fromColumn: 1, toColumn: 1, color: '#7c3aed', endsAtNode: true },
          { fromColumn: 1, toColumn: 1, color: '#7c3aed', startsAtNode: true },
        ],
      }),
      node('localMain', {
        column: 0,
        commit: { ...node('localMain').commit, parentOids: ['below', 's'] },
        connections: [
          { fromColumn: 0, toColumn: 0, color: '#2563eb', endsAtNode: true }, // lane arriving at its node
          { fromColumn: 0, toColumn: 0, color: '#2563eb', startsAtNode: true }, // real history below
          { fromColumn: 1, toColumn: 0, color: '#7c3aed' }, // mainline merging down into it
        ],
      }),
      node('below', {
        column: 0,
        connections: [{ fromColumn: 0, toColumn: 0, color: '#2563eb', endsAtNode: true }],
      }),
    ]
    const { result } = renderHook(() => useGitGraphNodes(nodes, undefined, 2, t, null))
    const rn = result.current.renderNodes
    expect(rn.map((n) => n.commit.oid)).toEqual(['WIP', 'remoteTip', 'mid', 'localMain', 'below'])

    // Every column-0 segment crossing the remote-tip and intermediate rows stays dashed.
    const tipCol0 = rn[1].connections.find((c) => c.fromColumn === 0 && c.toColumn === 0)
    expect(tipCol0?.dashed).toBe(true)
    const midCol0 = rn[2].connections.find((c) => c.fromColumn === 0 && c.toColumn === 0)
    expect(midCol0?.dashed).toBe(true)

    // The local main node's incoming column-0 edge is dashed and reaches the node center…
    const incoming = rn[3].connections.find(
      (c) => c.fromColumn === 0 && c.toColumn === 0 && c.endsAtNode
    )
    expect(incoming?.dashed).toBe(true)
    // …its departure into real history below stays solid…
    const departure = rn[3].connections.find(
      (c) => c.fromColumn === 0 && c.toColumn === 0 && c.startsAtNode
    )
    expect(departure?.dashed).toBeFalsy()
    // …and history below the node is untouched.
    const belowCol0 = rn[4].connections.find((c) => c.fromColumn === 0 && c.toColumn === 0)
    expect(belowCol0?.dashed).toBeFalsy()
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

  // Regression: the origin/main commit's OWN downward departure leads into already-pushed
  // history, so it must stay solid — otherwise the "ahead of origin" dashing runs half a row past
  // the origin/main node and the dashed→solid transition lands in the empty gap below it instead
  // of on the node. `b` is origin/main (a plain, non-merge commit) with an incoming edge from the
  // unpushed commit above and a departure to its pushed parent below.
  it("keeps the origin/main commit's own departure to pushed history solid", () => {
    const nodes = [
      node('a', {
        column: 0,
        commit: { ...node('a').commit, parentOids: ['b'] },
        connections: [
          { fromColumn: 0, toColumn: 0, color: '#7c3aed', startsAtNode: true }, // unpushed → dashed
        ],
      }),
      node('b', {
        column: 0,
        commit: { ...node('b').commit, parentOids: ['c'] },
        refs: [
          {
            name: 'refs/remotes/origin/main',
            shortName: 'origin/main',
            type: 'remote',
            commitOid: 'b',
          },
        ],
        connections: [
          { fromColumn: 0, toColumn: 0, color: '#7c3aed', endsAtNode: true }, // incoming from above
          { fromColumn: 0, toColumn: 0, color: '#7c3aed', startsAtNode: true }, // departure to pushed parent
        ],
      }),
      node('c', {
        column: 0,
        connections: [{ fromColumn: 0, toColumn: 0, color: '#7c3aed', endsAtNode: true }],
      }),
    ]
    const { result } = renderHook(() => useGitGraphNodes(nodes, undefined, 0, t, null))
    const originMain = result.current.renderNodes[1]
    // The line arriving from the unpushed commit above stays dashed…
    const incoming = originMain.connections.find(
      (c) => c.fromColumn === 0 && c.toColumn === 0 && c.endsAtNode
    )
    expect(incoming?.dashed).toBe(true)
    // …but the departure down into already-pushed history stays SOLID (was wrongly dashed).
    const departure = originMain.connections.find(
      (c) => c.fromColumn === 0 && c.toColumn === 0 && c.startsAtNode
    )
    expect(departure?.dashed).toBeFalsy()
    // The unpushed commit above stays fully dashed.
    const above = result.current.renderNodes[0].connections.find(
      (c) => c.fromColumn === 0 && c.toColumn === 0
    )
    expect(above?.dashed).toBe(true)
    // Real history below origin/main is untouched (solid).
    const below = result.current.renderNodes[2].connections.find(
      (c) => c.fromColumn === 0 && c.toColumn === 0
    )
    expect(below?.dashed).toBeFalsy()
  })

  // Regression: a diamond `origin/main(b) → {p1, s1} → m` where the merge `m` is ahead of
  // origin/main. The merge sits ABOVE the origin/main boundary, so its whole column-0 mainline
  // vertical — including the straight-down departure to its first parent — is unpushed and must be
  // DASHED (an earlier version wrongly kept that leg solid, which shattered a merge-heavy mainline's
  // dashed line into mostly-solid segments that stopped short of the origin/main node). Only the
  // diagonal to the side branch stays solid (it isn't a column-0→0 edge). The origin/main commit's
  // OWN departure staying solid is covered by the test above.
  it("dashes a merge commit's whole column-0 vertical while it is ahead of origin/main", () => {
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
    // The mainline segment BELOW the merge dot (its first-parent link) is unpushed → dashed.
    const departure = merge.connections.find(
      (c) => c.fromColumn === 0 && c.toColumn === 0 && c.startsAtNode
    )
    expect(departure?.dashed).toBe(true)
    // The line arriving from above (still ahead of origin) stays dashed.
    const arriving = merge.connections.find(
      (c) => c.fromColumn === 0 && c.toColumn === 0 && c.endsAtNode
    )
    expect(arriving?.dashed).toBe(true)
    // The diagonal to the side branch (not a column-0→0 edge) stays solid.
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
