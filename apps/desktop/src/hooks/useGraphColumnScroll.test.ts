import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGraphColumnScroll, type GraphColumnScrollBounds } from './useGraphColumnScroll'

// The graph column sits between x=100 and x=200 of a container whose own left edge is at x=0.
const BOUNDS: GraphColumnScrollBounds = { left: 100, width: 100, maxScrollX: 60 }

let container: HTMLDivElement

/** jsdom gives every element a zero rect, which is exactly the "container starts at x=0" we want. */
function wheelAt(x: number, init: WheelEventInit = {}) {
  const event = new WheelEvent('wheel', { clientX: x, bubbles: true, cancelable: true, ...init })
  act(() => {
    container.dispatchEvent(event)
  })
  return event
}

function renderScroll(bounds: GraphColumnScrollBounds = BOUNDS) {
  const ref = { current: container as HTMLElement | null }
  return renderHook(({ b }) => useGraphColumnScroll(ref, b), { initialProps: { b: bounds } })
}

describe('useGraphColumnScroll', () => {
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('starts unscrolled', () => {
    expect(renderScroll().result.current).toBe(0)
  })

  it('pans on a horizontal wheel over the column, and swallows the event', () => {
    const { result } = renderScroll()
    const event = wheelAt(150, { deltaX: 30 })
    expect(result.current).toBe(30)
    expect(event.defaultPrevented).toBe(true)
  })

  it('accumulates deltas and scrolls back to 0', () => {
    const { result } = renderScroll()
    wheelAt(150, { deltaX: 30 })
    wheelAt(150, { deltaX: 10 })
    expect(result.current).toBe(40)
    wheelAt(150, { deltaX: -25 })
    expect(result.current).toBe(15)
  })

  it('clamps to the scrollable range', () => {
    const { result } = renderScroll()
    wheelAt(150, { deltaX: 500 })
    expect(result.current).toBe(60)
    wheelAt(150, { deltaX: -500 })
    expect(result.current).toBe(0)
  })

  it('ignores a wheel landing outside the column', () => {
    const { result } = renderScroll()
    const left = wheelAt(99, { deltaX: 30 })
    const right = wheelAt(201, { deltaX: 30 })
    expect(result.current).toBe(0)
    expect(left.defaultPrevented).toBe(false)
    expect(right.defaultPrevented).toBe(false)
  })

  it('lets a plain vertical wheel scroll the list', () => {
    const { result } = renderScroll()
    const event = wheelAt(150, { deltaY: 40 })
    expect(result.current).toBe(0)
    expect(event.defaultPrevented).toBe(false)
  })

  it('treats Shift+wheel as the mouse equivalent of a horizontal swipe', () => {
    const { result } = renderScroll()
    const event = wheelAt(150, { deltaY: 40, shiftKey: true })
    expect(result.current).toBe(40)
    // Swallowed, so the list doesn't scroll vertically at the same time.
    expect(event.defaultPrevented).toBe(true)
  })

  it('does nothing at all when every lane already fits', () => {
    const { result } = renderScroll({ ...BOUNDS, maxScrollX: 0 })
    const event = wheelAt(150, { deltaX: 30 })
    expect(result.current).toBe(0)
    expect(event.defaultPrevented).toBe(false)
  })

  it('re-clamps an existing offset when the graph stops needing it', () => {
    const { result, rerender } = renderScroll()
    wheelAt(150, { deltaX: 60 })
    expect(result.current).toBe(60)
    // The user widens the column (or switches to a repo with fewer lanes).
    rerender({ b: { ...BOUNDS, maxScrollX: 20 } })
    expect(result.current).toBe(20)
  })

  it('ignores a wheel outside the container entirely', () => {
    const { result } = renderScroll()
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    act(() => {
      outside.dispatchEvent(
        new WheelEvent('wheel', { clientX: 150, deltaX: 30, bubbles: true, cancelable: true })
      )
    })
    expect(result.current).toBe(0)
    outside.remove()
  })
})
