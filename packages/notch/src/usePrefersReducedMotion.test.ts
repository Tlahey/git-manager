import { describe, it, expect, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

/** A media query list we can flip, standing in for the OS setting. */
function fakeMatchMedia(initial: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const list = {
    matches: initial,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.delete(listener),
  }
  return {
    install: () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => list)
      )
    },
    flip: (matches: boolean) => {
      list.matches = matches
      for (const listener of listeners) listener({ matches } as MediaQueryListEvent)
    },
    listenerCount: () => listeners.size,
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('usePrefersReducedMotion', () => {
  it('reports the setting as it stands on the first render', () => {
    fakeMatchMedia(true).install()
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(true)
  })

  it('follows the setting being changed while a card is open', () => {
    // Read live rather than once at module load: Storybook and the app's long-lived windows outlast
    // a trip to System Settings, and the notch window is the only one created per notification.
    const media = fakeMatchMedia(false)
    media.install()
    const { result } = renderHook(() => usePrefersReducedMotion())
    expect(result.current).toBe(false)

    act(() => media.flip(true))
    expect(result.current).toBe(true)
  })

  it('stops listening when the card goes away', () => {
    const media = fakeMatchMedia(false)
    media.install()
    const { unmount } = renderHook(() => usePrefersReducedMotion())
    expect(media.listenerCount()).toBe(1)
    unmount()
    expect(media.listenerCount()).toBe(0)
  })

  it('assumes motion is fine where there is no matchMedia to ask', () => {
    // This package renders in a Tauri webview, a Storybook page and jsdom, and only two of those are
    // browsers. Throwing here would take the whole card down with it.
    vi.stubGlobal('matchMedia', undefined)
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(false)
  })
})
