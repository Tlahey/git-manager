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
})
