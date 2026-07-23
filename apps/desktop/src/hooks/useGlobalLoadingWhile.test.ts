import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useGlobalLoadingWhile } from './useGlobalLoadingWhile'
import { useGlobalLoadingStore, selectIsGlobalLoading } from '../stores/globalLoading.store'

const isLoading = () => selectIsGlobalLoading(useGlobalLoadingStore.getState())

describe('useGlobalLoadingWhile', () => {
  beforeEach(() => {
    useGlobalLoadingStore.setState({ active: {} })
  })

  it('does nothing while inactive', () => {
    renderHook(() => useGlobalLoadingWhile(false, 'x'))
    expect(isLoading()).toBe(false)
  })

  it('registers loading while active and clears it when it flips to false', () => {
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) => useGlobalLoadingWhile(active, 'x'),
      { initialProps: { active: true } }
    )
    expect(isLoading()).toBe(true)

    rerender({ active: false })
    expect(isLoading()).toBe(false)
  })

  it('clears loading on unmount', () => {
    const { unmount } = renderHook(() => useGlobalLoadingWhile(true, 'x'))
    expect(isLoading()).toBe(true)
    unmount()
    expect(isLoading()).toBe(false)
  })
})
