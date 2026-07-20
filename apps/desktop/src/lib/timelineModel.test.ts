import { describe, it, expect } from 'vitest'
import { deriveTimeline } from './timelineModel'
import type { UndoAction } from './undoActions'

function commit(id: string, previousOid: string, newOid: string, timestamp = 0): UndoAction {
  return {
    id,
    label: { key: 'undo.commit' },
    timestamp,
    pinnedRefs: [],
    type: 'commit',
    previousOid,
    newOid,
  }
}

function discard(id: string): UndoAction {
  return {
    id,
    label: { key: 'undo.discard' },
    timestamp: 0,
    pinnedRefs: [],
    type: 'discard',
    filePath: 'a.txt',
    blobOid: 'blob1',
    wasStaged: false,
  }
}

describe('deriveTimeline', () => {
  it('returns a single base step for an empty stack', () => {
    const { steps, currentIndex } = deriveTimeline([], 0)
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ index: 0, label: null, type: 'base', headOid: null })
    expect(currentIndex).toBe(0)
  })

  it('produces stack.length + 1 steps with the base first', () => {
    const stack = [commit('a', 'oid0', 'oid1'), commit('b', 'oid1', 'oid2')]
    const { steps } = deriveTimeline(stack, 2)
    expect(steps).toHaveLength(3)
    expect(steps.map((s) => s.index)).toEqual([0, 1, 2])
    expect(steps[0].type).toBe('base')
    expect(steps[1].type).toBe('commit')
  })

  it('derives the base HEAD from the first action and each step HEAD from the action after it', () => {
    const stack = [commit('a', 'oid0', 'oid1'), commit('b', 'oid1', 'oid2')]
    const { steps } = deriveTimeline(stack, 2)
    expect(steps[0].headOid).toBe('oid0')
    expect(steps[1].headOid).toBe('oid1')
    expect(steps[2].headOid).toBe('oid2')
  })

  it('carries the last known HEAD forward across HEAD-less actions', () => {
    const stack = [commit('a', 'oid0', 'oid1'), discard('b')]
    const { steps } = deriveTimeline(stack, 2)
    expect(steps[1].headOid).toBe('oid1')
    expect(steps[2].headOid).toBe('oid1')
    expect(steps[2].type).toBe('discard')
  })

  it('carries the labels through from each action', () => {
    const stack = [commit('a', 'oid0', 'oid1')]
    const { steps } = deriveTimeline(stack, 1)
    expect(steps[0].label).toBeNull()
    expect(steps[1].label).toEqual({ key: 'undo.commit' })
  })

  it('carries each action timestamp through, with null for the base step', () => {
    const stack = [commit('a', 'oid0', 'oid1', 1700000000000)]
    const { steps } = deriveTimeline(stack, 1)
    expect(steps[0].timestamp).toBeNull()
    expect(steps[1].timestamp).toBe(1700000000000)
  })

  it('clamps currentIndex into range', () => {
    const stack = [commit('a', 'oid0', 'oid1')]
    expect(deriveTimeline(stack, 5).currentIndex).toBe(1)
    expect(deriveTimeline(stack, -3).currentIndex).toBe(0)
  })
})
