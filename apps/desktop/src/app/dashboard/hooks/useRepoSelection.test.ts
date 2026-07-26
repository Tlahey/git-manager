import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRepoSelection } from './useRepoSelection'

const PATHS = ['/repo/a', '/repo/b', '/repo/c']

describe('useRepoSelection', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useRepoSelection(PATHS))
    expect(result.current.selectedPaths).toEqual([])
    expect(result.current.allSelected).toBe(false)
    expect(result.current.someSelected).toBe(false)
  })

  it('toggles a single path on and off', () => {
    const { result } = renderHook(() => useRepoSelection(PATHS))
    act(() => result.current.toggle('/repo/b'))
    expect(result.current.selectedPaths).toEqual(['/repo/b'])
    expect(result.current.isSelected('/repo/b')).toBe(true)
    expect(result.current.someSelected).toBe(true)

    act(() => result.current.toggle('/repo/b'))
    expect(result.current.selectedPaths).toEqual([])
  })

  it('returns selected paths in the section display order', () => {
    const { result } = renderHook(() => useRepoSelection(PATHS))
    act(() => result.current.toggle('/repo/c'))
    act(() => result.current.toggle('/repo/a'))
    expect(result.current.selectedPaths).toEqual(['/repo/a', '/repo/c'])
  })

  it('toggleAll selects everything, then clears', () => {
    const { result } = renderHook(() => useRepoSelection(PATHS))
    act(() => result.current.toggleAll())
    expect(result.current.selectedPaths).toEqual(PATHS)
    expect(result.current.allSelected).toBe(true)
    expect(result.current.someSelected).toBe(false)

    act(() => result.current.toggleAll())
    expect(result.current.selectedPaths).toEqual([])
  })

  it('toggleAll completes a partial selection instead of clearing it', () => {
    const { result } = renderHook(() => useRepoSelection(PATHS))
    act(() => result.current.toggle('/repo/a'))
    act(() => result.current.toggleAll())
    expect(result.current.selectedPaths).toEqual(PATHS)
  })

  it('clear empties the selection', () => {
    const { result } = renderHook(() => useRepoSelection(PATHS))
    act(() => result.current.toggleAll())
    act(() => result.current.clear())
    expect(result.current.selectedPaths).toEqual([])
  })

  it('drops paths that leave the section, e.g. after a bulk removal', () => {
    const { result, rerender } = renderHook(({ paths }) => useRepoSelection(paths), {
      initialProps: { paths: PATHS },
    })
    act(() => result.current.toggleAll())
    rerender({ paths: ['/repo/a'] })
    expect(result.current.selectedPaths).toEqual(['/repo/a'])
    expect(result.current.allSelected).toBe(true)
  })

  it('reports nothing selected for an empty section', () => {
    const { result } = renderHook(() => useRepoSelection([]))
    act(() => result.current.toggleAll())
    expect(result.current.selectedPaths).toEqual([])
    expect(result.current.allSelected).toBe(false)
  })
})
