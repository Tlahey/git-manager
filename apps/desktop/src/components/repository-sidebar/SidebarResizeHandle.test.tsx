import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { SidebarResizeHandle } from './SidebarResizeHandle'

// jsdom has no PointerEvent constructor, so dispatch plain Events with the type it listens for.
function firePointer(target: Element, type: 'pointerdown' | 'pointermove' | 'pointerup') {
  target.dispatchEvent(new Event(type, { bubbles: true }))
}

describe('SidebarResizeHandle', () => {
  it('forwards pointerdown/pointermove/pointerup to the given handlers', () => {
    const onPointerDown = vi.fn()
    const onPointerMove = vi.fn()
    const onPointerUp = vi.fn()
    const { container } = render(
      <SidebarResizeHandle
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
    )
    const handle = container.firstElementChild!
    firePointer(handle, 'pointerdown')
    firePointer(handle, 'pointermove')
    firePointer(handle, 'pointerup')
    expect(onPointerDown).toHaveBeenCalledOnce()
    expect(onPointerMove).toHaveBeenCalledOnce()
    expect(onPointerUp).toHaveBeenCalledOnce()
  })

  it('is hidden from the accessibility tree', () => {
    const { container } = render(
      <SidebarResizeHandle onPointerDown={vi.fn()} onPointerMove={vi.fn()} onPointerUp={vi.fn()} />
    )
    expect(container.firstElementChild).toHaveAttribute('aria-hidden')
  })
})
