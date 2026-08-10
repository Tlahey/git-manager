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

  // The notch gates its cards on this being false, and the app can activate *itself* while raising
  // one (opening a webview does, on macOS). Believing that instantly switched the card off, took
  // its window down and put it back on the next tick — so a search that should have shown one card
  // showed a flicker of nothing.
  describe('with a settle delay', () => {
    it('does not believe a focus that does not hold', () => {
      vi.useFakeTimers()
      try {
        mockHasFocus(true)
        const { result } = renderHook(() => useWindowFocus({ settleMs: 600 }))

        act(() => {
          window.dispatchEvent(new Event('blur'))
        })
        expect(result.current).toBe(false)

        // The blip: focus arrives and is taken away again well inside the settle window.
        act(() => {
          window.dispatchEvent(new Event('focus'))
        })
        act(() => {
          vi.advanceTimersByTime(100)
        })
        act(() => {
          window.dispatchEvent(new Event('blur'))
        })
        act(() => {
          vi.advanceTimersByTime(1000)
        })

        expect(result.current).toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })

    it('believes a focus the user actually meant', () => {
      vi.useFakeTimers()
      try {
        mockHasFocus(true)
        const { result } = renderHook(() => useWindowFocus({ settleMs: 600 }))

        act(() => {
          window.dispatchEvent(new Event('blur'))
        })
        act(() => {
          window.dispatchEvent(new Event('focus'))
        })
        expect(result.current).toBe(false)

        act(() => {
          vi.advanceTimersByTime(600)
        })
        expect(result.current).toBe(true)
      } finally {
        vi.useRealTimers()
      }
    })

    it('still reports losing focus immediately', () => {
      // Only the regaining is distrusted. A card that waited to appear would be pointless.
      vi.useFakeTimers()
      try {
        mockHasFocus(true)
        const { result } = renderHook(() => useWindowFocus({ settleMs: 600 }))

        act(() => {
          window.dispatchEvent(new Event('blur'))
        })
        expect(result.current).toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })
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
