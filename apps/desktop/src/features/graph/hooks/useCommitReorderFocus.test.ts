import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { GitGraphNode } from '@git-manager/git-types'
import { planOperation, type CommitReorderOperation } from '../lib/commitReorder'
import { useCommitReorderFocus } from './useCommitReorderFocus'

function node(oid: string, parents: string[] = []): GitGraphNode {
  return {
    commit: { oid, shortOid: oid, subject: `subject ${oid}`, parentOids: parents },
    // No ref badges: `findHeadOid` then falls back to the newest real commit, which is what a
    // reloaded graph looks like before the branch list has caught up anyway.
    refs: [],
    column: 0,
    color: '#fff',
    connections: [],
  } as unknown as GitGraphNode
}

/** A first-parent line, newest first — `oids[0]` is HEAD. */
function line(oids: string[]): GitGraphNode[] {
  return oids.map((oid, i) => node(oid, i + 1 < oids.length ? [oids[i + 1]] : []))
}

function operation(dragged: string[], target: Parameters<typeof planOperation>[2]) {
  const result = planOperation(['a', 'b', 'c'], dragged, target)
  if ('error' in result) throw new Error(result.error)
  return result
}

/** Move `a` (newest) below `c` — resultOids ends up ['b', 'c', 'a']. */
const movedToBottom = operation(['a'], { kind: 'gap', oid: 'c', edge: 'below' })

const before = line(['a', 'b', 'c'])
const after = line(['b2', 'c2', 'a2'])

const setSelected = vi.fn()
const setPrimaryOid = vi.fn()
const scrollToIndex = vi.fn()
const clearLanded = vi.fn()

function setup({
  landed = movedToBottom as CommitReorderOperation | null,
  nodes = after,
  filteredNodes = nodes,
}: {
  landed?: CommitReorderOperation | null
  nodes?: GitGraphNode[]
  filteredNodes?: GitGraphNode[]
} = {}) {
  return renderHook(() =>
    useCommitReorderFocus({
      landed,
      clearLanded,
      nodes,
      filteredNodes,
      headBranchName: null,
      setSelected,
      setPrimaryOid,
      scrollToIndex,
    })
  )
}

beforeEach(() => vi.clearAllMocks())

describe('useCommitReorderFocus', () => {
  it('selects the moved commit at its new OID once the rewritten history has loaded', () => {
    setup()
    expect(setSelected).toHaveBeenCalledWith(new Set(['a2']))
    expect(setPrimaryOid).toHaveBeenCalledWith('a2')
    expect(clearLanded).toHaveBeenCalledOnce()
  })

  it('brings the moved commit into view', () => {
    setup()
    // 'a2' is the third row of the reloaded graph.
    expect(scrollToIndex).toHaveBeenCalledWith(2, { align: 'center' })
  })

  it('waits rather than select the wrong rows against the pre-rebase graph', () => {
    setup({ nodes: before })
    expect(setSelected).not.toHaveBeenCalled()
    expect(setPrimaryOid).not.toHaveBeenCalled()
    expect(clearLanded).not.toHaveBeenCalled()
  })

  it('does nothing at all with no landed operation', () => {
    setup({ landed: null })
    expect(setSelected).not.toHaveBeenCalled()
    expect(clearLanded).not.toHaveBeenCalled()
  })

  it('gives up on a history the plan cannot explain instead of retrying forever', () => {
    setup({ nodes: line(['zzz']) })
    expect(setSelected).not.toHaveBeenCalled()
    expect(clearLanded).toHaveBeenCalledOnce()
  })

  it('still restores the selection when the moved row is filtered off screen', () => {
    setup({ nodes: after, filteredNodes: line(['b2']) })
    expect(setSelected).toHaveBeenCalledWith(new Set(['a2']))
    expect(scrollToIndex).not.toHaveBeenCalled()
  })

  it('makes the newest of a moved group the primary row', () => {
    const group = operation(['a', 'b'], { kind: 'gap', oid: 'c', edge: 'below' })
    setup({ landed: group, nodes: line(['c2', 'a2', 'b2']) })
    expect(setSelected).toHaveBeenCalledWith(new Set(['a2', 'b2']))
    expect(setPrimaryOid).toHaveBeenCalledWith('a2')
  })

  it('lands on the commit a combine folded the others into', () => {
    const combine = operation(['a'], { kind: 'combine', oid: 'c' })
    setup({ landed: combine, nodes: line(['b2', 'c2']) })
    expect(setSelected).toHaveBeenCalledWith(new Set(['c2']))
    expect(setPrimaryOid).toHaveBeenCalledWith('c2')
  })
})
