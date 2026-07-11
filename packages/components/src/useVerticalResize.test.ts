import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type React from 'react'
import { useVerticalResize } from './useVerticalResize'

function pointerEvent(clientY: number): React.PointerEvent<HTMLDivElement> {
  return {
    clientY,
    pointerId: 1,
    preventDefault: vi.fn(),
    currentTarget: {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    },
  } as unknown as React.PointerEvent<HTMLDivElement>
}

describe('useVerticalResize', () => {
  it('starts at the default height', () => {
    const { result } = renderHook(() => useVerticalResize(200, 80, 600))
    expect(result.current.height).toBe(200)
  })

  it('dragging down (increasing clientY) increases height', () => {
    const { result } = renderHook(() => useVerticalResize(200, 80, 600))
    act(() => result.current.resizeProps.onPointerDown(pointerEvent(300)))
    act(() => result.current.resizeProps.onPointerMove(pointerEvent(350))) // moved 50px down
    expect(result.current.height).toBe(250)
  })

  it('dragging up (decreasing clientY) decreases height', () => {
    const { result } = renderHook(() => useVerticalResize(200, 80, 600))
    act(() => result.current.resizeProps.onPointerDown(pointerEvent(300)))
    act(() => result.current.resizeProps.onPointerMove(pointerEvent(280))) // moved 20px up
    expect(result.current.height).toBe(180)
  })

  it('clamps to minHeight', () => {
    const { result } = renderHook(() => useVerticalResize(200, 80, 600))
    act(() => result.current.resizeProps.onPointerDown(pointerEvent(300)))
    act(() => result.current.resizeProps.onPointerMove(pointerEvent(-1000)))
    expect(result.current.height).toBe(80)
  })

  it('clamps to maxHeight', () => {
    const { result } = renderHook(() => useVerticalResize(200, 80, 600))
    act(() => result.current.resizeProps.onPointerDown(pointerEvent(300)))
    act(() => result.current.resizeProps.onPointerMove(pointerEvent(2000)))
    expect(result.current.height).toBe(600)
  })

  it('ignores pointer moves before a pointer down', () => {
    const { result } = renderHook(() => useVerticalResize(200, 80, 600))
    act(() => result.current.resizeProps.onPointerMove(pointerEvent(500)))
    expect(result.current.height).toBe(200)
  })

  it('ignores pointer moves after pointer up', () => {
    const { result } = renderHook(() => useVerticalResize(200, 80, 600))
    act(() => result.current.resizeProps.onPointerDown(pointerEvent(300)))
    act(() => result.current.resizeProps.onPointerUp(pointerEvent(300)))
    act(() => result.current.resizeProps.onPointerMove(pointerEvent(350)))
    expect(result.current.height).toBe(200)
  })

  it('captures and releases pointer capture on the drag handle element', () => {
    const { result } = renderHook(() => useVerticalResize(200, 80, 600))
    const down = pointerEvent(300)
    act(() => result.current.resizeProps.onPointerDown(down))
    expect(down.currentTarget.setPointerCapture).toHaveBeenCalledWith(1)

    const up = pointerEvent(300)
    act(() => result.current.resizeProps.onPointerUp(up))
    expect(up.currentTarget.releasePointerCapture).toHaveBeenCalledWith(1)
  })

  it('swallows an error from releasePointerCapture instead of throwing', () => {
    const { result } = renderHook(() => useVerticalResize(200, 80, 600))
    act(() => result.current.resizeProps.onPointerDown(pointerEvent(300)))
    const up = pointerEvent(300)
    ;(up.currentTarget.releasePointerCapture as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('not captured')
    })
    expect(() => act(() => result.current.resizeProps.onPointerUp(up))).not.toThrow()
  })
})
