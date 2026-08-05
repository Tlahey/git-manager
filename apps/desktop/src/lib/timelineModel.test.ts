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

// The overlay walks to a picked step by calling `undo`/`redo` once per step, and the store moves a
// whole gesture per call. A timeline that counted raw entries would ask for two undos where one
// gesture answers both, and sail past the step the user picked.
describe('deriveTimeline — one step per gesture', () => {
  const correlated = (a: UndoAction, id: string): UndoAction => ({ ...a, correlationId: id })

  it('collapses the entries of one gesture into a single step', () => {
    const stack = [
      correlated(commit('create', 'oid0', 'oid1'), 'corr-1'),
      correlated(commit('checkout', 'oid1', 'oid2'), 'corr-1'),
      commit('later', 'oid2', 'oid3'),
    ]
    const { steps } = deriveTimeline(stack, 3)
    expect(steps).toHaveLength(3) // base + gesture + lone action
    // The step carries the HEAD the *whole* gesture left behind, not its first operation's.
    expect(steps[1]).toMatchObject({ index: 1, headOid: 'oid2' })
    expect(steps[2]).toMatchObject({ index: 2, headOid: 'oid3' })
  })

  it('names a gesture after its first entry, like the undo tooltip does', () => {
    const stack = [
      correlated({ ...commit('create', 'oid0', 'oid1'), label: { key: 'undo.createBranch' } }, 'c'),
      correlated({ ...commit('checkout', 'oid1', 'oid2'), label: { key: 'undo.checkout' } }, 'c'),
    ]
    expect(deriveTimeline(stack, 2).steps[1].label).toEqual({ key: 'undo.createBranch' })
  })

  it('counts currentIndex in gestures, not in entries', () => {
    const stack = [
      correlated(commit('create', 'oid0', 'oid1'), 'corr-1'),
      correlated(commit('checkout', 'oid1', 'oid2'), 'corr-1'),
      commit('later', 'oid2', 'oid3'),
    ]
    expect(deriveTimeline(stack, 3).currentIndex).toBe(2)
    expect(deriveTimeline(stack, 2).currentIndex).toBe(1) // the gesture is fully applied
    // A pointer landing inside a gesture (a pruned persisted stack) rounds down to a reachable step.
    expect(deriveTimeline(stack, 1).currentIndex).toBe(0)
  })

  it('keeps two adjacent gestures apart', () => {
    const stack = [
      correlated(commit('a', 'oid0', 'oid1'), 'corr-1'),
      correlated(commit('b', 'oid1', 'oid2'), 'corr-2'),
    ]
    expect(deriveTimeline(stack, 2).steps).toHaveLength(3)
  })
})
