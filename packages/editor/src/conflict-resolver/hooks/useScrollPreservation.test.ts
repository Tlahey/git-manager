import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { editor } from 'monaco-editor'
import type { MergeEditorRefs } from './useMergeEditorRefs'
import { useScrollPreservation } from './useScrollPreservation'

function fakePane(initialScrollTop: number) {
  let scrollTop = initialScrollTop
  return {
    getScrollTop: () => scrollTop,
    setScrollTop: (v: number) => {
      scrollTop = v
    },
  } as unknown as editor.IStandaloneCodeEditor
}

function fakeEditorBundle(): MergeEditorRefs {
  return {
    monacoRef: { current: null },
    oursEditorRef: { current: fakePane(100) },
    centerEditorRef: { current: fakePane(200) },
    theirsEditorRef: { current: fakePane(300) },
    oursDecorationsRef: { current: null },
    centerDecorationsRef: { current: null },
    theirsDecorationsRef: { current: null },
    oursZoneIdsRef: { current: [] },
    centerZoneIdsRef: { current: [] },
    theirsZoneIdsRef: { current: [] },
    oursCollapsedViewZonesRef: { current: [] },
    centerCollapsedViewZonesRef: { current: [] },
    theirsCollapsedViewZonesRef: { current: [] },
  }
}

describe('useScrollPreservation', () => {
  let rafCallbacks: FrameRequestCallback[]

  beforeEach(() => {
    rafCallbacks = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('pauses scroll sync during a preserved action and restores the snapshot afterwards', () => {
    const editors = fakeEditorBundle()
    const { result } = renderHook(() => useScrollPreservation(editors))

    act(() => {
      result.current.executeWithScrollPreservation(() => {
        // The action itself scrolls the panes around (as gutter edits do via Monaco).
        editors.centerEditorRef.current!.setScrollTop(999)
        expect(result.current.ignoreScrollSyncRef.current).toBe(true)
      })
    })

    // Still paused until the decorations effect restores.
    expect(result.current.ignoreScrollSyncRef.current).toBe(true)

    act(() => {
      result.current.restoreSavedScrollTops(false)
    })

    expect(editors.oursEditorRef.current!.getScrollTop()).toBe(100)
    expect(editors.centerEditorRef.current!.getScrollTop()).toBe(200)
    expect(editors.theirsEditorRef.current!.getScrollTop()).toBe(300)

    // Sync only resumes a frame later, once the restored scroll has painted.
    expect(result.current.ignoreScrollSyncRef.current).toBe(true)
    act(() => {
      rafCallbacks.forEach((cb) => cb(0))
    })
    expect(result.current.ignoreScrollSyncRef.current).toBe(false)
  })

  it('skips the ours pane on restore in 2-way mode', () => {
    const editors = fakeEditorBundle()
    const { result } = renderHook(() => useScrollPreservation(editors))

    act(() => {
      result.current.executeWithScrollPreservation(() => {})
    })
    editors.oursEditorRef.current!.setScrollTop(777)

    act(() => {
      result.current.restoreSavedScrollTops(true)
    })
    expect(editors.oursEditorRef.current!.getScrollTop()).toBe(777) // untouched
    expect(editors.centerEditorRef.current!.getScrollTop()).toBe(200)
  })

  it('resumes sync immediately when the action throws', () => {
    const editors = fakeEditorBundle()
    const { result } = renderHook(() => useScrollPreservation(editors))

    expect(() =>
      result.current.executeWithScrollPreservation(() => {
        throw new Error('boom')
      })
    ).toThrow('boom')

    expect(result.current.ignoreScrollSyncRef.current).toBe(false)
    // Nothing left to restore.
    act(() => {
      editors.centerEditorRef.current!.setScrollTop(42)
      result.current.restoreSavedScrollTops(false)
    })
    expect(editors.centerEditorRef.current!.getScrollTop()).toBe(42)
  })

  it('resumes sync via the safety timeout if no restore ever happens', () => {
    vi.useFakeTimers()
    const editors = fakeEditorBundle()
    const { result } = renderHook(() => useScrollPreservation(editors))

    act(() => {
      result.current.executeWithScrollPreservation(() => {})
    })
    expect(result.current.ignoreScrollSyncRef.current).toBe(true)

    act(() => {
      vi.advanceTimersByTime(151)
    })
    expect(result.current.ignoreScrollSyncRef.current).toBe(false)
  })

  it('does not snapshot when a pane is missing (before all editors mounted)', () => {
    const editors = fakeEditorBundle()
    editors.oursEditorRef.current = null
    const { result } = renderHook(() => useScrollPreservation(editors))

    act(() => {
      result.current.executeWithScrollPreservation(() => {})
    })
    expect(result.current.ignoreScrollSyncRef.current).toBe(false)
  })
})
