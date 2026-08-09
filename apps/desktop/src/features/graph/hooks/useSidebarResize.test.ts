import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type React from 'react'
import { useSidebarResize } from './useSidebarResize'

function pointerEvent(clientX: number, button = 0): React.PointerEvent<HTMLDivElement> {
  return {
    clientX,
    button,
    pointerId: 1,
    preventDefault: vi.fn(),
    currentTarget: { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() },
  } as unknown as React.PointerEvent<HTMLDivElement>
}

beforeEach(() => {
  localStorage.clear()
})

describe('useSidebarResize — initial state', () => {
  it('defaults to 240px when nothing is stored', () => {
    const { result } = renderHook(() => useSidebarResize())
    expect(result.current.width).toBe(240)
  })

  it('restores a valid stored width', () => {
    localStorage.setItem('sidebar-width', '300')
    const { result } = renderHook(() => useSidebarResize())
    expect(result.current.width).toBe(300)
  })

  it('falls back to default for an out-of-range stored width', () => {
    localStorage.setItem('sidebar-width', '9999')
    const { result } = renderHook(() => useSidebarResize())
    expect(result.current.width).toBe(240)
  })

  it('falls back to default for a non-numeric stored width', () => {
    localStorage.setItem('sidebar-width', 'not-a-number')
    const { result } = renderHook(() => useSidebarResize())
    expect(result.current.width).toBe(240)
  })

  /**
   * The hook used to own a collapsed (48px icon rail) state alongside the width. It went with the
   * button that was its only entrance — whether the panel is on screen at all is `repoView.store`'s
   * `isPanelOpen` now. A stale `sidebar-collapsed` key left in a user's storage must therefore do
   * nothing rather than resurrect a mode nothing can leave.
   */
  it('ignores a persisted collapsed flag from the version that had one', () => {
    localStorage.setItem('sidebar-collapsed', '1')
    const { result } = renderHook(() => useSidebarResize())
    expect(result.current).not.toHaveProperty('isCollapsed')
    expect(result.current.width).toBe(240)
  })
})

describe('useSidebarResize — dragging', () => {
  it('resizes on drag within bounds', () => {
    const { result } = renderHook(() => useSidebarResize())
    act(() => result.current.resizeHandleProps.onPointerDown(pointerEvent(100)))
    act(() => result.current.resizeHandleProps.onPointerMove(pointerEvent(150)))
    expect(result.current.width).toBe(290)
  })

  it('clamps to MIN_WIDTH (160)', () => {
    const { result } = renderHook(() => useSidebarResize())
    act(() => result.current.resizeHandleProps.onPointerDown(pointerEvent(500)))
    act(() => result.current.resizeHandleProps.onPointerMove(pointerEvent(-500)))
    expect(result.current.width).toBe(160)
  })

  it('clamps to MAX_WIDTH (480)', () => {
    const { result } = renderHook(() => useSidebarResize())
    act(() => result.current.resizeHandleProps.onPointerDown(pointerEvent(100)))
    act(() => result.current.resizeHandleProps.onPointerMove(pointerEvent(2000)))
    expect(result.current.width).toBe(480)
  })

  it('ignores non-left-button pointer down (e.g. right-click)', () => {
    const { result } = renderHook(() => useSidebarResize())
    act(() => result.current.resizeHandleProps.onPointerDown(pointerEvent(100, 2)))
    act(() => result.current.resizeHandleProps.onPointerMove(pointerEvent(300)))
    expect(result.current.width).toBe(240) // unchanged — drag never started
  })

  it('ignores pointer moves after pointer up', () => {
    const { result } = renderHook(() => useSidebarResize())
    act(() => result.current.resizeHandleProps.onPointerDown(pointerEvent(100)))
    act(() => result.current.resizeHandleProps.onPointerUp(pointerEvent(100)))
    act(() => result.current.resizeHandleProps.onPointerMove(pointerEvent(300)))
    expect(result.current.width).toBe(240)
  })
})

describe('useSidebarResize — persistence side effects', () => {
  it('persists width changes to localStorage', () => {
    const { result } = renderHook(() => useSidebarResize())
    act(() => result.current.resizeHandleProps.onPointerDown(pointerEvent(100)))
    act(() => result.current.resizeHandleProps.onPointerMove(pointerEvent(150)))
    expect(localStorage.getItem('sidebar-width')).toBe('290')
  })
})
