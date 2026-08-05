import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { GitGraphNode } from '@git-manager/git-types'
import { useTimelineTransition, TIMELINE_EXIT_MS, TIMELINE_ENTER_MS } from './useTimelineTransition'

function nodes(...oids: string[]): GitGraphNode[] {
  return oids.map(
    (oid) => ({ commit: { oid, shortOid: oid }, refs: [] }) as unknown as GitGraphNode
  )
}

const oidsOf = (list: GitGraphNode[]) => list.map((n) => n.commit.oid)

function setup(initial: GitGraphNode[], active = true) {
  return renderHook(({ list, on }) => useTimelineTransition({ active: on, nodes: list }), {
    initialProps: { list: initial, on: active },
  })
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useTimelineTransition — commits leaving', () => {
  it('keeps the departing commits on screen, marked, before swapping lists', () => {
    const { result, rerender } = setup(nodes('c', 'b', 'a'))
    rerender({ list: nodes('a'), on: true })

    // Still the old history: there is nothing left to animate once the new list is in.
    expect(oidsOf(result.current.displayedNodes)).toEqual(['c', 'b', 'a'])
    expect([...result.current.exitingOids].sort()).toEqual(['b', 'c'])
  })

  it('swaps once the departure has played', () => {
    const { result, rerender } = setup(nodes('c', 'b', 'a'))
    rerender({ list: nodes('a'), on: true })
    act(() => void vi.advanceTimersByTime(TIMELINE_EXIT_MS))

    expect(oidsOf(result.current.displayedNodes)).toEqual(['a'])
    expect(result.current.exitingOids.size).toBe(0)
  })

  it('lands the pending step at once when the next one arrives mid-flight', () => {
    // Scrubbing faster than the animation must not queue: the graph would drift behind the
    // scrubber by one transition per step.
    const { result, rerender } = setup(nodes('c', 'b', 'a'))
    rerender({ list: nodes('b', 'a'), on: true })
    act(() => void vi.advanceTimersByTime(TIMELINE_EXIT_MS / 2))
    rerender({ list: nodes('a'), on: true })

    act(() => void vi.advanceTimersByTime(TIMELINE_EXIT_MS))
    expect(oidsOf(result.current.displayedNodes)).toEqual(['a'])
  })
})

describe('useTimelineTransition — commits arriving', () => {
  it("marks a redo step's commits as arriving, with nothing to wait for", () => {
    const { result, rerender } = setup(nodes('a'))
    rerender({ list: nodes('c', 'b', 'a'), on: true })

    expect(oidsOf(result.current.displayedNodes)).toEqual(['c', 'b', 'a'])
    expect([...result.current.enteringOids].sort()).toEqual(['b', 'c'])
  })

  it('stops marking them once they have arrived', () => {
    const { result, rerender } = setup(nodes('a'))
    rerender({ list: nodes('b', 'a'), on: true })
    act(() => void vi.advanceTimersByTime(TIMELINE_ENTER_MS))
    expect(result.current.enteringOids.size).toBe(0)
  })

  it('marks arrivals of a step that both removes and adds, after the departure', () => {
    // A rebase undo: the same work comes back under different OIDs.
    const { result, rerender } = setup(nodes('c2', 'b2', 'a'))
    rerender({ list: nodes('c', 'b', 'a'), on: true })
    expect([...result.current.exitingOids].sort()).toEqual(['b2', 'c2'])
    expect(result.current.enteringOids.size).toBe(0)

    act(() => void vi.advanceTimersByTime(TIMELINE_EXIT_MS))
    expect([...result.current.enteringOids].sort()).toEqual(['b', 'c'])
  })
})

describe('useTimelineTransition — outside the timeline', () => {
  it('passes the real history straight through, with no animation and no timer', () => {
    const { result, rerender } = setup(nodes('c', 'b', 'a'), false)
    rerender({ list: nodes('a'), on: false })

    expect(oidsOf(result.current.displayedNodes)).toEqual(['a'])
    expect(result.current.exitingOids.size).toBe(0)
    expect(result.current.enteringOids.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('snaps to the real history when the timeline closes mid-transition', () => {
    const { result, rerender } = setup(nodes('c', 'b', 'a'))
    rerender({ list: nodes('a'), on: true })
    expect(result.current.exitingOids.size).toBe(2)

    rerender({ list: nodes('c', 'b', 'a'), on: false })
    expect(oidsOf(result.current.displayedNodes)).toEqual(['c', 'b', 'a'])
    expect(result.current.exitingOids.size).toBe(0)
  })

  it('does not animate the step the timeline opens on', () => {
    // The opening step is the current one, so the graph it opens into is the one already shown.
    const list = nodes('c', 'b', 'a')
    const { result, rerender } = setup(list, false)
    rerender({ list, on: true })
    expect(result.current.exitingOids.size).toBe(0)
    expect(result.current.enteringOids.size).toBe(0)
  })
})
