import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react'
import { createRef } from 'react'
import { Tooltip, useImperativeTooltip } from './tooltip'

function stubRect(el: Element, rect: Partial<DOMRect>) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect)
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Tooltip — show/hide timing', () => {
  it('does not render the tooltip initially', () => {
    render(
      <Tooltip content="Hello">
        <button>Trigger</button>
      </Tooltip>
    )
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows the tooltip after the default delay on hover', () => {
    render(
      <Tooltip content="Hello">
        <button>Trigger</button>
      </Tooltip>
    )
    fireEvent.mouseEnter(screen.getByText('Trigger'))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    act(() => vi.advanceTimersByTime(150))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Hello')
  })

  it('respects a custom delay', () => {
    render(
      <Tooltip content="Hello" delay={500}>
        <button>Trigger</button>
      </Tooltip>
    )
    fireEvent.mouseEnter(screen.getByText('Trigger'))
    act(() => vi.advanceTimersByTime(150))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    act(() => vi.advanceTimersByTime(350))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })

  it('hides immediately on mouse leave, even before the delay elapses', () => {
    render(
      <Tooltip content="Hello">
        <button>Trigger</button>
      </Tooltip>
    )
    fireEvent.mouseEnter(screen.getByText('Trigger'))
    fireEvent.mouseLeave(screen.getByText('Trigger'))
    act(() => vi.advanceTimersByTime(150))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('hides an already-visible tooltip on mouse leave', () => {
    render(
      <Tooltip content="Hello">
        <button>Trigger</button>
      </Tooltip>
    )
    fireEvent.mouseEnter(screen.getByText('Trigger'))
    act(() => vi.advanceTimersByTime(150))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    fireEvent.mouseLeave(screen.getByText('Trigger'))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows on focus and hides on blur', () => {
    render(
      <Tooltip content="Hello">
        <button>Trigger</button>
      </Tooltip>
    )
    fireEvent.focus(screen.getByText('Trigger'))
    act(() => vi.advanceTimersByTime(150))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    fireEvent.blur(screen.getByText('Trigger'))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('plays the entry animation by default', () => {
    render(
      <Tooltip content="Hello">
        <button>Trigger</button>
      </Tooltip>
    )
    fireEvent.mouseEnter(screen.getByText('Trigger'))
    act(() => vi.advanceTimersByTime(150))
    expect(screen.getByRole('tooltip').className).toContain('animate-in')
  })

  it('omits the entry animation when animate is false', () => {
    render(
      <Tooltip content="Hello" animate={false}>
        <button>Trigger</button>
      </Tooltip>
    )
    fireEvent.mouseEnter(screen.getByText('Trigger'))
    act(() => vi.advanceTimersByTime(150))
    expect(screen.getByRole('tooltip').className).not.toContain('animate-in')
  })

  // Regression: the bubble carried a bare `duration-150`, which emits `transition-duration` —
  // leaving `transition-property` at its initial value, `all`. Since the bubble is mounted at
  // -9999px to be measured and only then moved onto the trigger, that move became a 150ms
  // animation: the tooltip appeared far above the trigger and slid down into place.
  //
  // jsdom runs no transitions, so what is asserted is the guard — the bubble opts out of
  // transitions outright, and carries no class that could turn one back on. `animate-duration-*`
  // is deliberately still allowed: it times the keyframe animation and never a transition.
  it('never transitions the position it is moved to after being measured', () => {
    render(
      <Tooltip content="Hello" className="max-w-xs">
        <button>Trigger</button>
      </Tooltip>
    )
    fireEvent.mouseEnter(screen.getByText('Trigger'))
    act(() => vi.advanceTimersByTime(150))

    const bubble = screen.getByRole('tooltip')
    expect(bubble.style.transition).toBe('none')
    expect(bubble.className).not.toMatch(/(?<!animate-)\bduration-/)
    expect(bubble.className).not.toMatch(/\btransition\b|\btransition-/)
  })

  it('never shows when disabled', () => {
    render(
      <Tooltip content="Hello" disabled>
        <button>Trigger</button>
      </Tooltip>
    )
    fireEvent.mouseEnter(screen.getByText('Trigger'))
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  // Callers flip `disabled` when the tooltip has stopped being the relevant thing to show — e.g.
  // the pointer moved onto a child that owns a more specific tooltip. Leaving the stale bubble up
  // until the pointer exits the trigger would stack the two on top of each other.
  it('retracts an already-visible tooltip when it becomes disabled', () => {
    const { rerender } = render(
      <Tooltip content="Hello">
        <button>Trigger</button>
      </Tooltip>
    )
    fireEvent.mouseEnter(screen.getByText('Trigger'))
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    rerender(
      <Tooltip content="Hello" disabled>
        <button>Trigger</button>
      </Tooltip>
    )
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('cancels a tooltip still waiting out its delay when it becomes disabled', () => {
    const { rerender } = render(
      <Tooltip content="Hello" delay={500}>
        <button>Trigger</button>
      </Tooltip>
    )
    fireEvent.mouseEnter(screen.getByText('Trigger'))
    act(() => vi.advanceTimersByTime(200))

    rerender(
      <Tooltip content="Hello" delay={500} disabled>
        <button>Trigger</button>
      </Tooltip>
    )
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('still invokes the child element own mouse/focus handlers', () => {
    const onMouseEnter = vi.fn()
    const onBlur = vi.fn()
    render(
      <Tooltip content="Hello">
        <button onMouseEnter={onMouseEnter} onBlur={onBlur}>
          Trigger
        </button>
      </Tooltip>
    )
    fireEvent.mouseEnter(screen.getByText('Trigger'))
    fireEvent.blur(screen.getByText('Trigger'))
    expect(onMouseEnter).toHaveBeenCalledOnce()
    expect(onBlur).toHaveBeenCalledOnce()
  })

  it('clears the pending timer on unmount so no late state update occurs', () => {
    const { unmount } = render(
      <Tooltip content="Hello">
        <button>Trigger</button>
      </Tooltip>
    )
    fireEvent.mouseEnter(screen.getByText('Trigger'))
    unmount()
    expect(() => act(() => vi.advanceTimersByTime(150))).not.toThrow()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})

describe('Tooltip — accessibility', () => {
  it('wires the trigger to the bubble via aria-describedby only while visible', () => {
    render(
      <Tooltip content="Hello">
        <button>Trigger</button>
      </Tooltip>
    )
    const trigger = screen.getByText('Trigger')
    expect(trigger).not.toHaveAttribute('aria-describedby')

    fireEvent.mouseEnter(trigger)
    act(() => vi.advanceTimersByTime(150))

    const describedBy = trigger.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(screen.getByRole('tooltip')).toHaveAttribute('id', describedBy)

    fireEvent.mouseLeave(trigger)
    expect(trigger).not.toHaveAttribute('aria-describedby')
  })

  it('preserves an existing aria-describedby on the child when hidden', () => {
    render(
      <Tooltip content="Hello">
        <button aria-describedby="external-hint">Trigger</button>
      </Tooltip>
    )
    expect(screen.getByText('Trigger')).toHaveAttribute('aria-describedby', 'external-hint')
  })

  it('dismisses on Escape and forwards the child own onKeyDown', () => {
    const onKeyDown = vi.fn()
    render(
      <Tooltip content="Hello">
        <button onKeyDown={onKeyDown}>Trigger</button>
      </Tooltip>
    )
    const trigger = screen.getByText('Trigger')
    fireEvent.mouseEnter(trigger)
    act(() => vi.advanceTimersByTime(150))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(onKeyDown).toHaveBeenCalledOnce()
  })
})

describe('Tooltip — ref forwarding', () => {
  it('forwards the DOM node to an existing object ref on the child', () => {
    const externalRef = createRef<HTMLButtonElement>()
    render(
      <Tooltip content="Hello">
        <button ref={externalRef}>Trigger</button>
      </Tooltip>
    )
    expect(externalRef.current).toBeInstanceOf(HTMLButtonElement)
  })

  it('forwards the DOM node to an existing function ref on the child', () => {
    const fnRef = vi.fn()
    render(
      <Tooltip content="Hello">
        <button ref={fnRef}>Trigger</button>
      </Tooltip>
    )
    expect(fnRef).toHaveBeenCalledWith(expect.any(HTMLButtonElement))
  })
})

describe('Tooltip — positioning', () => {
  it('places the bubble below the trigger and flips away from an edge that does not fit', () => {
    const { container } = render(
      <Tooltip content="Hello" placement="top">
        <button>Trigger</button>
      </Tooltip>
    )
    const trigger = screen.getByText('Trigger')
    // Near the very top of the viewport: a "top" placement would go negative and not fit.
    stubRect(trigger, { top: 2, left: 500, right: 600, bottom: 22, width: 100, height: 20 })

    fireEvent.mouseEnter(trigger)
    act(() => vi.advanceTimersByTime(150))

    const bubble = container.ownerDocument.querySelector('[role="tooltip"]') as HTMLElement
    expect(bubble.style.top).toBe('28px') // trigger.bottom(22) + scrollY(0) + GAP(6)
    expect(bubble.style.left).toBe('550px') // trigger.left(500) + width/2(50)
  })

  it('clamps the bubble within the viewport instead of overflowing', () => {
    const { container } = render(
      <Tooltip content="Hello" placement="right">
        <button>Trigger</button>
      </Tooltip>
    )
    const trigger = screen.getByText('Trigger')
    // Far right edge: a "right" placement would overflow past window.innerWidth.
    stubRect(trigger, {
      top: 300,
      left: window.innerWidth - 10,
      right: window.innerWidth,
      bottom: 320,
      width: 10,
      height: 20,
    })

    fireEvent.mouseEnter(trigger)
    act(() => vi.advanceTimersByTime(150))

    const bubble = container.ownerDocument.querySelector('[role="tooltip"]') as HTMLElement
    expect(Number(bubble.style.left.replace('px', ''))).toBeLessThanOrEqual(window.innerWidth - 4)
  })
})

/**
 * jsdom performs no layout, so a bubble measures 0×0 and every placement trivially fits. These
 * cases stub the bubble's own size to actually exercise the fit/flip decision.
 */
describe('Tooltip — placement is honoured for a bubble wider than its trigger', () => {
  /**
   * Give the bubble a real size through *both* measurement APIs. Stubbing only the offset
   * properties would let these cases pass against an implementation that measures with a bounding
   * rect, since jsdom reports 0×0 there and every placement then trivially fits.
   */
  function stubBubbleSize(width: number, height: number) {
    const isBubble = (el: Element) => el.getAttribute('role') === 'tooltip'
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get(this: HTMLElement) {
        return isBubble(this) ? width : 0
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return isBubble(this) ? height : 0
      },
    })
    const nativeRect = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      if (!isBubble(this)) return nativeRect.call(this)
      return { width, height, top: 0, left: 0, bottom: height, right: width } as DOMRect
    })
  }

  function showAt(placement: 'top' | 'bottom' | 'left' | 'right', rect: Partial<DOMRect>) {
    render(
      <Tooltip content="Hello" placement={placement}>
        <button>Trigger</button>
      </Tooltip>
    )
    const trigger = screen.getByText('Trigger')
    stubRect(trigger, rect)
    fireEvent.mouseEnter(trigger)
    act(() => vi.advanceTimersByTime(150))
    return document.querySelector('[role="tooltip"]') as HTMLElement
  }

  afterEach(() => {
    // @ts-expect-error — restore jsdom's own zero-size getters.
    delete HTMLElement.prototype.offsetWidth
    // @ts-expect-error — same.
    delete HTMLElement.prototype.offsetHeight
  })

  // Regression: a 288px card on a narrow sidebar row overflowed horizontally, which disqualified
  // *every* vertical placement and dumped the bubble beside the trigger instead of under it.
  // Horizontal overflow is the clamp's job, not grounds for changing side.
  it('still opens below when the bubble overflows the trigger horizontally', () => {
    stubBubbleSize(288, 60)
    const bubble = showAt('bottom', {
      top: 200,
      bottom: 220,
      left: 20,
      right: 120,
      width: 100,
      height: 20,
    })
    expect(bubble.style.top).toBe('226px') // trigger.bottom(220) + GAP(6)
  })

  it('flips above when there is genuinely no room below', () => {
    stubBubbleSize(288, 60)
    const bubble = showAt('bottom', {
      top: window.innerHeight - 30,
      bottom: window.innerHeight - 10,
      left: 20,
      right: 120,
      width: 100,
      height: 20,
    })
    // Above the trigger: trigger.top - bubble height(60) - GAP(6).
    expect(bubble.style.top).toBe(`${window.innerHeight - 30 - 66}px`)
  })

  it('clamps a too-wide bubble to the viewport rather than letting it overflow', () => {
    stubBubbleSize(288, 60)
    const bubble = showAt('bottom', {
      top: 200,
      bottom: 220,
      left: 20,
      right: 120,
      width: 100,
      height: 20,
    })
    expect(Number(bubble.style.left.replace('px', ''))).toBeGreaterThanOrEqual(4)
  })

  // The horizontal placements keep deciding on the horizontal axis.
  it('flips a right placement to the left when the right edge is out of room', () => {
    stubBubbleSize(288, 60)
    const bubble = showAt('right', {
      top: 200,
      bottom: 220,
      left: window.innerWidth - 120,
      right: window.innerWidth - 20,
      width: 100,
      height: 20,
    })
    // To the left of the trigger: trigger.left - bubble width(288) - GAP(6).
    expect(bubble.style.left).toBe(`${window.innerWidth - 120 - 294}px`)
  })

  // Regression: the bubble used to be measured with getBoundingClientRect() while `zoom-in-95` was
  // mid-flight. That API reports the *transformed* box, so the bubble read ~5% small, was placed
  // from those wrong dimensions, and visibly drifted as the scale settled to 1.
  //
  // jsdom runs no animations, so the drift itself can't be reproduced here — what is asserted is
  // the guard against it: the bubble is sized through the transform-independent offset properties
  // and never through a bounding rect.
  it('measures itself with the untransformed layout box', () => {
    stubBubbleSize(288, 60)
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    const bubble = showAt('bottom', {
      top: 200,
      bottom: 220,
      left: 300,
      right: 400,
      width: 100,
      height: 20,
    })

    expect(rectSpy.mock.instances).not.toContain(bubble)
    // Centred on the trigger using the bubble's full 288px width.
    expect(bubble.style.left).toBe(`${300 + 50 - 144}px`)
  })
})

function ImperativeTooltipHost({ el }: { el: HTMLElement }) {
  const { show, hide, portal } = useImperativeTooltip()
  return (
    <>
      <button onClick={() => show('Cell info', el)}>show</button>
      <button onClick={hide}>hide</button>
      {portal}
    </>
  )
}

describe('useImperativeTooltip', () => {
  it('starts with no portal', () => {
    const { result } = renderHook(() => useImperativeTooltip())
    expect(result.current.portal).toBeNull()
  })

  it('show() renders a tooltip near the given element, hide() removes it', () => {
    const el = document.createElement('div')
    stubRect(el, { top: 100, left: 50, width: 40, height: 20 })
    render(<ImperativeTooltipHost el={el} />)

    fireEvent.click(screen.getByText('show'))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Cell info')

    fireEvent.click(screen.getByText('hide'))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
