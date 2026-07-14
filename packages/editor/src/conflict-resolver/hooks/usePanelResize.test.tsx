import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePanelResize } from './usePanelResize'

// The full drag behavior (percent math, clamping, DOM wiring through the real handles) is
// covered end-to-end by ConflictResolver.test.tsx's "panel resizing" suite — these tests pin
// the hook's own contract in isolation.

function containerWithWidth(width: number) {
  const el = document.createElement('div')
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    width,
    height: 600,
    top: 0,
    left: 0,
    bottom: 600,
    right: width,
    x: 0,
    y: 0,
    toJSON: () => {},
  })
  return { current: el }
}

function mouseDownEvent(clientX: number, targetClassName = ''): React.MouseEvent {
  const target = document.createElement('div')
  if (targetClassName) target.className = targetClassName
  document.body.appendChild(target)
  return {
    clientX,
    target,
    preventDefault: vi.fn(),
  } as unknown as React.MouseEvent
}

describe('usePanelResize', () => {
  it('starts at 50/50 in 2-way mode and thirds in 3-way mode', () => {
    const containerRef = containerWithWidth(1080)
    const twoWay = renderHook(() => usePanelResize(containerRef, true))
    expect(twoWay.result.current.panelWidths).toEqual([50, 50, 0])

    const threeWay = renderHook(() => usePanelResize(containerRef, false))
    expect(threeWay.result.current.panelWidths).toEqual([33.333, 33.334, 33.333])
  })

  it('redistributes width between the two panes around the dragged handle', () => {
    const containerRef = containerWithWidth(1080) // panelsWidth = 1080 - 80 = 1000
    const { result } = renderHook(() => usePanelResize(containerRef, false))

    act(() => {
      result.current.handleLeftMouseDown(mouseDownEvent(200))
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 300 })) // dx 100 → 10%
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup'))
    })

    const [left, center, right] = result.current.panelWidths
    expect(left).toBeCloseTo(43.333, 3)
    expect(center).toBeCloseTo(23.334, 3)
    expect(right).toBeCloseTo(33.333, 3)
  })

  it('clamps at the minimum pane width and stops tracking after mouseup', () => {
    const containerRef = containerWithWidth(1080)
    const { result } = renderHook(() => usePanelResize(containerRef, false))

    act(() => {
      result.current.handleRightMouseDown(mouseDownEvent(800))
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 6000 }))
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup'))
    })

    // minPct = min(33.3, 150/1000*100) = 15
    expect(result.current.panelWidths[2]).toBeCloseTo(15, 3)
    expect(result.current.panelWidths[1]).toBeCloseTo(51.667, 3)

    const after = result.current.panelWidths
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100 }))
    })
    expect(result.current.panelWidths).toEqual(after) // listener removed on mouseup
  })

  it('ignores mousedowns on the connector action buttons living inside the gap', () => {
    const containerRef = containerWithWidth(1080)
    const { result } = renderHook(() => usePanelResize(containerRef, false))

    const event = mouseDownEvent(200, 'merge-connector-action')
    act(() => {
      result.current.handleLeftMouseDown(event)
    })
    expect(event.preventDefault).not.toHaveBeenCalled()

    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 900 }))
    })
    expect(result.current.panelWidths).toEqual([33.333, 33.334, 33.333])
  })

  it('resetPanelWidths restores the mode’s initial split', () => {
    const containerRef = containerWithWidth(1080)
    const { result } = renderHook(() => usePanelResize(containerRef, false))

    act(() => {
      result.current.handleLeftMouseDown(mouseDownEvent(200))
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 400 }))
      window.dispatchEvent(new MouseEvent('mouseup'))
    })
    expect(result.current.panelWidths[0]).not.toBeCloseTo(33.333, 3)

    act(() => {
      result.current.resetPanelWidths()
    })
    expect(result.current.panelWidths).toEqual([33.333, 33.334, 33.333])
  })
})
