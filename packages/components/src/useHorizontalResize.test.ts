import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type React from 'react'
import { useHorizontalResize } from './useHorizontalResize'

function pointerEvent(clientX: number): React.PointerEvent<HTMLDivElement> {
  return {
    clientX,
    pointerId: 1,
    preventDefault: vi.fn(),
    currentTarget: {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    },
  } as unknown as React.PointerEvent<HTMLDivElement>
}

describe('useHorizontalResize', () => {
  it('starts at the default width', () => {
    const { result } = renderHook(() => useHorizontalResize(400, 350, 700))
    expect(result.current.width).toBe(400)
  })

  it('growing the panel by dragging left (decreasing clientX) increases width', () => {
    const { result } = renderHook(() => useHorizontalResize(400, 350, 700))
    act(() => result.current.resizeProps.onPointerDown(pointerEvent(500)))
    act(() => result.current.resizeProps.onPointerMove(pointerEvent(450))) // moved 50px left
    expect(result.current.width).toBe(450)
  })

  it('dragging right (increasing clientX) decreases width', () => {
    const { result } = renderHook(() => useHorizontalResize(400, 350, 700))
    act(() => result.current.resizeProps.onPointerDown(pointerEvent(500)))
    act(() => result.current.resizeProps.onPointerMove(pointerEvent(510))) // moved 10px right
    expect(result.current.width).toBe(390)
  })

  it('clamps to minWidth', () => {
    const { result } = renderHook(() => useHorizontalResize(400, 350, 700))
    act(() => result.current.resizeProps.onPointerDown(pointerEvent(500)))
    act(() => result.current.resizeProps.onPointerMove(pointerEvent(1000))) // huge rightward drag
    expect(result.current.width).toBe(350)
  })

  it('clamps to maxWidth', () => {
    const { result } = renderHook(() => useHorizontalResize(400, 350, 700))
    act(() => result.current.resizeProps.onPointerDown(pointerEvent(500)))
    act(() => result.current.resizeProps.onPointerMove(pointerEvent(-1000))) // huge leftward drag
    expect(result.current.width).toBe(700)
  })

  it('ignores pointer moves before a pointer down (not dragging)', () => {
    const { result } = renderHook(() => useHorizontalResize(400, 350, 700))
    act(() => result.current.resizeProps.onPointerMove(pointerEvent(200)))
    expect(result.current.width).toBe(400)
  })

  it('ignores pointer moves after pointer up', () => {
    const { result } = renderHook(() => useHorizontalResize(400, 350, 700))
    act(() => result.current.resizeProps.onPointerDown(pointerEvent(500)))
    act(() => result.current.resizeProps.onPointerUp(pointerEvent(500)))
    act(() => result.current.resizeProps.onPointerMove(pointerEvent(450)))
    expect(result.current.width).toBe(400)
  })

  it('captures and releases pointer capture on the drag handle element', () => {
    const { result } = renderHook(() => useHorizontalResize(400, 350, 700))
    const down = pointerEvent(500)
    act(() => result.current.resizeProps.onPointerDown(down))
    expect(down.currentTarget.setPointerCapture).toHaveBeenCalledWith(1)

    const up = pointerEvent(500)
    act(() => result.current.resizeProps.onPointerUp(up))
    expect(up.currentTarget.releasePointerCapture).toHaveBeenCalledWith(1)
  })

  it('ignoring a pointer-up while not dragging does not throw', () => {
    const { result } = renderHook(() => useHorizontalResize(400, 350, 700))
    expect(() => act(() => result.current.resizeProps.onPointerUp(pointerEvent(500)))).not.toThrow()
  })

  it('swallows an error from releasePointerCapture instead of throwing', () => {
    const { result } = renderHook(() => useHorizontalResize(400, 350, 700))
    act(() => result.current.resizeProps.onPointerDown(pointerEvent(500)))
    const up = pointerEvent(500)
    ;(up.currentTarget.releasePointerCapture as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('not captured')
    })
    expect(() => act(() => result.current.resizeProps.onPointerUp(up))).not.toThrow()
  })
})
