import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useSingleOrDoubleClick, DOUBLE_CLICK_DELAY } from './useSingleOrDoubleClick'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function render(single = vi.fn(), double = vi.fn()) {
  const view = renderHook(({ s, d }) => useSingleOrDoubleClick(s, d), {
    initialProps: { s: single, d: double },
  })
  return { ...view, single, double }
}

const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

describe('useSingleOrDoubleClick', () => {
  it('runs the single-click action once the delay has passed', () => {
    const { result, single } = render()
    act(() => result.current.handleClick())
    expect(single).not.toHaveBeenCalled()

    wait(DOUBLE_CLICK_DELAY)
    expect(single).toHaveBeenCalledTimes(1)
  })

  // The reason the hook exists: the DOM fires `click` on the first half of a double click.
  it('drops the pending single-click action when the double click arrives', () => {
    const { result, single, double } = render()
    act(() => result.current.handleClick())
    act(() => result.current.handleDoubleClick())

    expect(double).toHaveBeenCalledTimes(1)
    wait(DOUBLE_CLICK_DELAY * 4)
    expect(single).not.toHaveBeenCalled()
  })

  it('restarts the delay on a second click, so a slow double click still runs once', () => {
    const { result, single } = render()
    act(() => result.current.handleClick())
    wait(DOUBLE_CLICK_DELAY - 10)
    act(() => result.current.handleClick())
    wait(DOUBLE_CLICK_DELAY - 10)
    expect(single).not.toHaveBeenCalled()

    wait(10)
    expect(single).toHaveBeenCalledTimes(1)
  })

  it('reads the callbacks at fire time, not at the time of the click', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { result, rerender } = render(first)

    act(() => result.current.handleClick())
    rerender({ s: second, d: vi.fn() })
    wait(DOUBLE_CLICK_DELAY)

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  // A row that disappears mid-delay (a checkout re-renders the list) must not fire into the void.
  it('drops a pending action when the component unmounts', () => {
    const { result, unmount, single } = render()
    act(() => result.current.handleClick())
    unmount()

    wait(DOUBLE_CLICK_DELAY * 2)
    expect(single).not.toHaveBeenCalled()
  })
})
