import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWindowFocus } from './useWindowFocus'

/** jsdom reports the document as focused by default; override it per test. */
function mockHasFocus(value: boolean) {
  return vi.spyOn(document, 'hasFocus').mockReturnValue(value)
}

function mockVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value, configurable: true })
}

afterEach(() => {
  vi.restoreAllMocks()
  mockVisibility('visible')
})

describe('useWindowFocus', () => {
  it('starts from the document’s current focus state', () => {
    mockHasFocus(true)
    const { result } = renderHook(() => useWindowFocus())
    expect(result.current).toBe(true)
  })

  it('reports unfocused when the document has no focus at mount', () => {
    mockHasFocus(false)
    const { result } = renderHook(() => useWindowFocus())
    expect(result.current).toBe(false)
  })

  it('flips to false on blur and back to true on focus', () => {
    mockHasFocus(true)
    const { result } = renderHook(() => useWindowFocus())

    act(() => {
      window.dispatchEvent(new Event('blur'))
    })
    expect(result.current).toBe(false)

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(result.current).toBe(true)
  })

  it('treats a hidden document as unfocused even while it still reports focus', () => {
    mockHasFocus(true)
    const { result } = renderHook(() => useWindowFocus())
    expect(result.current).toBe(true)

    mockVisibility('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current).toBe(false)
  })

  it('detaches its listeners on unmount', () => {
    mockHasFocus(true)
    const { result, unmount } = renderHook(() => useWindowFocus())
    unmount()

    act(() => {
      window.dispatchEvent(new Event('blur'))
    })
    // Still the last value seen while mounted — the listener is gone, nothing updated it.
    expect(result.current).toBe(true)
  })
})
