import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react'
import { createRef } from 'react'
import { Tooltip, useImperativeTooltip } from './Tooltip'

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
    stubRect(trigger, { top: 300, left: window.innerWidth - 10, right: window.innerWidth, bottom: 320, width: 10, height: 20 })

    fireEvent.mouseEnter(trigger)
    act(() => vi.advanceTimersByTime(150))

    const bubble = container.ownerDocument.querySelector('[role="tooltip"]') as HTMLElement
    expect(Number(bubble.style.left.replace('px', ''))).toBeLessThanOrEqual(window.innerWidth - 4)
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
