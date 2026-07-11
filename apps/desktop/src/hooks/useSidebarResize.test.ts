import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type React from 'react'
import { useSidebarResize, RAIL_WIDTH } from './useSidebarResize'

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

  it('restores collapsed state from storage', () => {
    localStorage.setItem('sidebar-collapsed', '1')
    const { result } = renderHook(() => useSidebarResize())
    expect(result.current.isCollapsed).toBe(true)
  })

  it('defaults to expanded when nothing is stored', () => {
    const { result } = renderHook(() => useSidebarResize())
    expect(result.current.isCollapsed).toBe(false)
  })

  it('exports the fixed RAIL_WIDTH constant', () => {
    expect(RAIL_WIDTH).toBe(48)
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

describe('useSidebarResize — collapse/expand/toggle', () => {
  it('collapse sets isCollapsed to true', () => {
    const { result } = renderHook(() => useSidebarResize())
    act(() => result.current.collapse())
    expect(result.current.isCollapsed).toBe(true)
  })

  it('expand sets isCollapsed to false', () => {
    localStorage.setItem('sidebar-collapsed', '1')
    const { result } = renderHook(() => useSidebarResize())
    act(() => result.current.expand())
    expect(result.current.isCollapsed).toBe(false)
  })

  it('toggle flips the current state', () => {
    const { result } = renderHook(() => useSidebarResize())
    act(() => result.current.toggle())
    expect(result.current.isCollapsed).toBe(true)
    act(() => result.current.toggle())
    expect(result.current.isCollapsed).toBe(false)
  })
})

describe('useSidebarResize — persistence side effects', () => {
  it('persists width changes to localStorage', () => {
    const { result } = renderHook(() => useSidebarResize())
    act(() => result.current.resizeHandleProps.onPointerDown(pointerEvent(100)))
    act(() => result.current.resizeHandleProps.onPointerMove(pointerEvent(150)))
    expect(localStorage.getItem('sidebar-width')).toBe('290')
  })

  it('persists collapsed state to localStorage', () => {
    const { result } = renderHook(() => useSidebarResize())
    act(() => result.current.collapse())
    expect(localStorage.getItem('sidebar-collapsed')).toBe('1')
    act(() => result.current.expand())
    expect(localStorage.getItem('sidebar-collapsed')).toBe('0')
  })
})
