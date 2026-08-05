import { describe, expect, it } from 'vitest'
import type { GitGraphNode } from '@git-manager/git-types'
import { computeTimelineDelta, NO_TIMELINE_DELTA } from './timelineDelta'

function nodes(...oids: string[]): GitGraphNode[] {
  return oids.map(
    (oid) =>
      ({ commit: { oid, shortOid: oid, parentOids: [] }, refs: [] }) as unknown as GitGraphNode
  )
}

describe('computeTimelineDelta', () => {
  it('counts the commits an undo step would take away', () => {
    expect(computeTimelineDelta(nodes('c', 'b', 'a'), nodes('a'))).toEqual({
      removed: 2,
      added: 0,
    })
  })

  it('counts the commits a redo step would bring back', () => {
    expect(computeTimelineDelta(nodes('a'), nodes('c', 'b', 'a'))).toEqual({
      removed: 0,
      added: 2,
    })
  })

  it('counts both sides of a step that rewrites rather than truncates', () => {
    // A rebase undo: the same work comes back under different OIDs.
    expect(computeTimelineDelta(nodes('c2', 'b2', 'a'), nodes('c', 'b', 'a'))).toEqual({
      removed: 2,
      added: 2,
    })
  })

  it('reports nothing for a step that changes no commit', () => {
    expect(computeTimelineDelta(nodes('c', 'b', 'a'), nodes('c', 'b', 'a'))).toEqual(
      NO_TIMELINE_DELTA
    )
  })

  it('never counts the synthetic rows, which are not commits', () => {
    expect(computeTimelineDelta(nodes('WIP', 'c', 'a'), nodes('WIP', 'a'))).toEqual({
      removed: 1,
      added: 0,
    })
    expect(computeTimelineDelta(nodes('CONFLICT', 'a'), nodes('a'))).toEqual(NO_TIMELINE_DELTA)
  })

  it('stays silent while one side has nothing to compare', () => {
    // The preview query is still in flight, or the graph had no data when the timeline opened —
    // reporting the whole history as removed would be a confident lie.
    expect(computeTimelineDelta(nodes('c', 'b', 'a'), nodes())).toEqual(NO_TIMELINE_DELTA)
    expect(computeTimelineDelta(nodes(), nodes('c', 'b', 'a'))).toEqual(NO_TIMELINE_DELTA)
    expect(computeTimelineDelta(nodes('WIP'), nodes('a'))).toEqual(NO_TIMELINE_DELTA)
  })
})
