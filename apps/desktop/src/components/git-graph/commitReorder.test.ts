import { describe, expect, it } from 'vitest'
import type { GitCommit, GitGraphNode, GitRef } from '@git-manager/git-types'
import {
  buildReorderPlan,
  collectReorderableOids,
  findHeadOid,
  firstPublishedIndex,
  isStaleWindow,
  locateMovedCommits,
  planOperation,
  reorderWindow,
  resolveDropTarget,
  type CommitDropTarget,
  type CommitReorderOperation,
} from './commitReorder'

/** `planOperation` narrowed to its success case — a rejection fails the test on the spot. */
function operation(
  window: string[],
  dragged: string[],
  target: CommitDropTarget
): CommitReorderOperation {
  const result = planOperation(window, dragged, target)
  if ('error' in result) throw new Error(`unexpected rejection: ${result.error}`)
  return result
}

function commit(oid: string, parents: string[] = []): GitCommit {
  return {
    oid,
    shortOid: oid.slice(0, 7),
    message: `msg ${oid}`,
    subject: `subject ${oid}`,
    body: '',
    author: { name: 'A', email: 'a@b.c', timestamp: 1 },
    committer: { name: 'A', email: 'a@b.c', timestamp: 1 },
    parentOids: parents,
  }
}

function node(oid: string, parents: string[] = [], refs: GitRef[] = []): GitGraphNode {
  return { commit: commit(oid, parents), column: 0, color: '#fff', connections: [], refs }
}

function ref(type: GitRef['type'], shortName: string, commitOid: string): GitRef {
  return { name: shortName, shortName, type, commitOid }
}

/** d ← c ← b ← a (a newest), all on one first-parent line. */
const linear = [node('a', ['b']), node('b', ['c']), node('c', ['d']), node('d', [])]

describe('collectReorderableOids', () => {
  it('walks HEAD down its first-parent line, newest first', () => {
    expect(collectReorderableOids(linear, 'a')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('stops before a merge commit so the rebase never flattens it', () => {
    const nodes = [node('a', ['b']), node('b', ['c', 'x']), node('c', []), node('x', [])]
    expect(collectReorderableOids(nodes, 'a')).toEqual(['a'])
  })

  it('stops at the edge of the loaded window instead of guessing', () => {
    expect(collectReorderableOids([node('a', ['b'])], 'a')).toEqual(['a'])
  })

  it('returns nothing without a HEAD', () => {
    expect(collectReorderableOids(linear, null)).toEqual([])
  })

  it('never walks into a synthetic row', () => {
    const nodes = [node('WIP', ['a']), ...linear]
    expect(collectReorderableOids(nodes, 'WIP')).toEqual([])
  })
})

describe('findHeadOid', () => {
  it('prefers an explicit detached HEAD badge', () => {
    const nodes = [node('a', ['b']), node('b', [], [ref('HEAD', 'HEAD', 'b')])]
    expect(findHeadOid(nodes, 'main')).toBe('b')
  })

  it('falls back to the node carrying the checked-out branch', () => {
    const nodes = [node('a', ['b']), node('b', [], [ref('branch', 'main', 'b')])]
    expect(findHeadOid(nodes, 'main')).toBe('b')
  })

  it('falls back to the newest real commit', () => {
    expect(findHeadOid([node('WIP'), ...linear], null)).toBe('a')
  })
})

describe('firstPublishedIndex', () => {
  it('reports the newest commit carrying a remote ref', () => {
    const nodes = [node('a', ['b']), node('b', ['c'], [ref('remote', 'origin/main', 'b')])]
    expect(firstPublishedIndex(nodes, ['a', 'b', 'c'])).toBe(1)
  })

  it('is null when nothing on the window has been pushed', () => {
    expect(firstPublishedIndex(linear, ['a', 'b'])).toBeNull()
  })
})

describe('resolveDropTarget', () => {
  it('reads the row edges as gaps and its middle as a combine', () => {
    expect(resolveDropTarget('a', 0.05)).toEqual({ kind: 'gap', oid: 'a', edge: 'above' })
    expect(resolveDropTarget('a', 0.5)).toEqual({ kind: 'combine', oid: 'a' })
    expect(resolveDropTarget('a', 0.95)).toEqual({ kind: 'gap', oid: 'a', edge: 'below' })
  })
})

describe('reorderWindow', () => {
  const w = ['a', 'b', 'c', 'd']

  it('moves a commit up', () => {
    expect(reorderWindow(w, ['c'], 0)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('moves a commit down to the very bottom', () => {
    expect(reorderWindow(w, ['a'], 4)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('keeps a non-contiguous group in its own relative order', () => {
    expect(reorderWindow(w, ['a', 'c'], 4)).toEqual(['b', 'd', 'a', 'c'])
  })
})

describe('planOperation', () => {
  const w = ['a', 'b', 'c', 'd']

  it('rejects a commit outside the reorderable window', () => {
    expect(planOperation(w, ['z'], { kind: 'combine', oid: 'a' })).toEqual({
      error: 'notReorderable',
    })
    expect(planOperation(w, ['a'], { kind: 'combine', oid: 'z' })).toEqual({
      error: 'notReorderable',
    })
  })

  it('rejects combining a commit with itself', () => {
    expect(planOperation(w, ['a'], { kind: 'combine', oid: 'a' })).toEqual({ error: 'noop' })
  })

  it('rejects a gap the group already occupies', () => {
    expect(planOperation(w, ['b'], { kind: 'gap', oid: 'b', edge: 'above' })).toEqual({
      error: 'noop',
    })
    expect(planOperation(w, ['b'], { kind: 'gap', oid: 'a', edge: 'below' })).toEqual({
      error: 'noop',
    })
  })

  it('bases a combine on the older of the two commits', () => {
    const op = planOperation(w, ['a'], { kind: 'combine', oid: 'c' })
    expect(op).toMatchObject({
      kind: 'combine',
      baseOid: 'c',
      affectedOids: ['a', 'b', 'c'],
      resultOids: ['b', 'c', 'a'],
    })
  })

  it('rewrites only down to the deepest commit a reorder touches', () => {
    const op = planOperation(w, ['a'], { kind: 'gap', oid: 'c', edge: 'above' })
    expect(op).toMatchObject({
      kind: 'reorder',
      baseOid: 'c',
      affectedOids: ['a', 'b', 'c'],
      resultOids: ['b', 'a', 'c'],
    })
  })

  it('includes the current oldest commit when the group is dropped below it', () => {
    const op = planOperation(w, ['a'], { kind: 'gap', oid: 'd', edge: 'below' })
    expect(op).toMatchObject({ baseOid: 'd', affectedOids: w, resultOids: ['b', 'c', 'd', 'a'] })
  })

  it('normalizes a scattered multi-selection into graph order', () => {
    const op = planOperation(w, ['c', 'a'], { kind: 'gap', oid: 'd', edge: 'above' })
    expect(op).toMatchObject({ sourceOids: ['a', 'c'], resultOids: ['b', 'a', 'c', 'd'] })
  })
})

describe('buildReorderPlan', () => {
  // The backend hands the range back oldest first.
  const commitsOldestFirst = [commit('d'), commit('c'), commit('b'), commit('a')]

  it('renders a reorder as picks in the new order, oldest first', () => {
    const op = operation(['a', 'b', 'c', 'd'], ['a'], { kind: 'gap', oid: 'd', edge: 'below' })
    const plan = buildReorderPlan(commitsOldestFirst, op, 'fixup')
    expect(plan.map((s) => `${s.action} ${s.commit.oid}`)).toEqual([
      'pick a',
      'pick d',
      'pick c',
      'pick b',
    ])
  })

  it('renders a combine as the target followed by the folded commits', () => {
    const op = operation(['a', 'b', 'c', 'd'], ['a'], { kind: 'combine', oid: 'c' })
    const plan = buildReorderPlan(commitsOldestFirst, op, 'fixup')
    expect(plan.map((s) => `${s.action} ${s.commit.oid}`)).toEqual([
      'pick d',
      'pick c',
      'fixup a',
      'pick b',
    ])
  })

  it('keeps both messages when the combine mode is squash', () => {
    const op = operation(['a', 'b'], ['a'], { kind: 'combine', oid: 'b' })
    const plan = buildReorderPlan([commit('b'), commit('a')], op, 'squash')
    expect(plan.map((s) => s.action)).toEqual(['pick', 'squash'])
  })

  it('refuses a range the backend no longer covers', () => {
    const op = operation(['a', 'b', 'c'], ['a'], { kind: 'gap', oid: 'c', edge: 'below' })
    expect(() => buildReorderPlan([commit('c'), commit('b')], op, 'fixup')).toThrow()
  })
})

describe('locateMovedCommits', () => {
  // Moving `a` (newest) below `c`: the rewritten range comes back as b, c, a with fresh OIDs.
  const reorder = operation(['a', 'b', 'c', 'd'], ['a'], { kind: 'gap', oid: 'd', edge: 'above' })

  it('follows a moved commit to its new OID by position', () => {
    // resultOids is ['b', 'c', 'a', 'd']; the rebase rewrote the first three.
    expect(locateMovedCommits(reorder, ['b2', 'c2', 'a2', 'd2'])).toEqual(['a2'])
  })

  it('follows a whole group, newest first', () => {
    const op = operation(['a', 'b', 'c'], ['a', 'b'], { kind: 'gap', oid: 'c', edge: 'below' })
    // resultOids is ['c', 'a', 'b'].
    expect(locateMovedCommits(op, ['c2', 'a2', 'b2'])).toEqual(['a2', 'b2'])
  })

  it('lands on the commit others were folded into, not on the folded ones', () => {
    const op = operation(['a', 'b', 'c'], ['a'], { kind: 'combine', oid: 'c' })
    // resultOids is ['b', 'c', 'a'] — `a` is gone after the fold, so the new range is b, c.
    expect(locateMovedCommits(op, ['b2', 'c2'])).toEqual(['c2'])
  })

  it('gives up rather than guess when the new history is shorter than the plan', () => {
    expect(locateMovedCommits(reorder, ['b2'])).toEqual([])
  })
})

describe('isStaleWindow', () => {
  const op = operation(['a', 'b', 'c'], ['a'], { kind: 'gap', oid: 'c', edge: 'below' })

  it('reports the pre-rebase graph, where the moved commit is still on HEAD', () => {
    expect(isStaleWindow(op, ['a', 'b', 'c'])).toBe(true)
  })

  it('clears once every moved commit has been rewritten', () => {
    expect(isStaleWindow(op, ['b2', 'c2', 'a2'])).toBe(false)
  })

  it('is not fooled by the old commit surviving off HEAD, since the window only walks HEAD', () => {
    // `a` kept alive by another branch is simply absent from HEAD's first-parent line.
    expect(isStaleWindow(op, ['c2', 'a2', 'b2'])).toBe(false)
  })
})
