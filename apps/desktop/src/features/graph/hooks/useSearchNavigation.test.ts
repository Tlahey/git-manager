import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSearchNavigation } from './useSearchNavigation'

describe('useSearchNavigation', () => {
  it('starts at index 0', () => {
    const { result } = renderHook(() => useSearchNavigation('needle', 3))
    expect(result.current.clampedMatchIndex).toBe(0)
  })

  it('cycles forward through matches, wrapping around', () => {
    const { result } = renderHook(() => useSearchNavigation('needle', 3))
    act(() => result.current.goToNextMatch())
    expect(result.current.clampedMatchIndex).toBe(1)
    act(() => result.current.goToNextMatch())
    act(() => result.current.goToNextMatch())
    expect(result.current.clampedMatchIndex).toBe(0)
  })

  it('cycles backward through matches, wrapping around', () => {
    const { result } = renderHook(() => useSearchNavigation('needle', 3))
    act(() => result.current.goToPreviousMatch())
    expect(result.current.clampedMatchIndex).toBe(2)
  })

  it('does nothing when there are no matches', () => {
    const { result } = renderHook(() => useSearchNavigation('needle', 0))
    act(() => result.current.goToNextMatch())
    expect(result.current.clampedMatchIndex).toBe(0)
  })

  it('resets to the first match when the query changes', () => {
    const { result, rerender } = renderHook(({ q, n }) => useSearchNavigation(q, n), {
      initialProps: { q: 'needle', n: 3 },
    })
    act(() => result.current.goToNextMatch())
    expect(result.current.clampedMatchIndex).toBe(1)

    rerender({ q: 'other', n: 3 })
    expect(result.current.clampedMatchIndex).toBe(0)
  })

  it('clamps the index down when the match count shrinks', () => {
    const { result, rerender } = renderHook(({ q, n }) => useSearchNavigation(q, n), {
      initialProps: { q: 'needle', n: 3 },
    })
    act(() => result.current.goToPreviousMatch())
    expect(result.current.clampedMatchIndex).toBe(2)

    rerender({ q: 'needle', n: 1 })
    expect(result.current.clampedMatchIndex).toBe(0)
  })
})
