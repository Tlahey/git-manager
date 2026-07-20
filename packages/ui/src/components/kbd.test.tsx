import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { Kbd } from './kbd'

describe('Kbd', () => {
  it('renders a <kbd> with its key label', () => {
    render(<Kbd>⌘</Kbd>)
    const el = screen.getByText('⌘')
    expect(el.tagName).toBe('KBD')
  })

  it('uses themed border/bg/text tokens', () => {
    render(<Kbd data-testid="k">K</Kbd>)
    const cls = screen.getByTestId('k').className
    expect(cls).toContain('border-border')
    expect(cls).toContain('bg-muted')
    expect(cls).toContain('text-foreground')
  })

  it('merges a custom className and forwards the ref', () => {
    const ref = createRef<HTMLElement>()
    render(
      <Kbd ref={ref} className="extra-class" data-testid="k">
        K
      </Kbd>
    )
    expect(ref.current?.tagName).toBe('KBD')
    expect(screen.getByTestId('k').className).toContain('extra-class')
  })
})
