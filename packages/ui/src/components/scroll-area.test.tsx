import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScrollArea } from './scroll-area'

describe('ScrollArea', () => {
  it('renders its children inside the scrollable viewport', () => {
    render(
      <ScrollArea>
        <div>Scrollable content</div>
      </ScrollArea>
    )
    expect(screen.getByText('Scrollable content')).toBeInTheDocument()
  })

  it('merges a custom className onto the root', () => {
    const { container } = render(
      <ScrollArea className="my-scroll-area">
        <div>content</div>
      </ScrollArea>
    )
    expect(container.firstElementChild?.className).toContain('my-scroll-area')
  })

  it("neutralizes Radix's shrink-to-fit content wrapper", () => {
    // Regression guard, not a style preference: Radix wraps children in a `display: table` div that
    // sizes to min-content and overflows the panel, and since this component renders no horizontal
    // scrollbar the excess is clipped rather than reachable. See the comment in scroll-area.tsx.
    const { container } = render(
      <ScrollArea>
        <div>content</div>
      </ScrollArea>
    )
    const viewport = container.querySelector('[data-radix-scroll-area-viewport]')
    expect(viewport).not.toBeNull()

    // The override has to target the wrapper Radix inserts, not our own child.
    const wrapper = viewport!.firstElementChild as HTMLElement
    expect(wrapper.style.display).toBe('table')
    expect(viewport!.className).toContain('[&>div]:!block')
  })
})
