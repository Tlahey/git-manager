import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { Button, buttonVariants } from './button'
import { cn } from '../lib/utils'

describe('Button', () => {
  it('renders a native button by default with its children', () => {
    render(<Button>Click me</Button>)
    const button = screen.getByRole('button', { name: 'Click me' })
    expect(button.tagName).toBe('BUTTON')
  })

  it('fires onClick when clicked and not disabled', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Go</Button>)
    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not fire onClick when disabled', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Button onClick={onClick} disabled>
        Go
      </Button>
    )
    await user.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('applies variant and size classes matching buttonVariants', () => {
    render(
      <Button variant="destructive" size="lg">
        Delete
      </Button>
    )
    const button = screen.getByRole('button')
    expect(button.className).toBe(cn(buttonVariants({ variant: 'destructive', size: 'lg' })))
  })

  it('merges a custom className without dropping variant classes', () => {
    render(<Button className="my-extra-class">Go</Button>)
    const button = screen.getByRole('button')
    expect(button.className).toContain('my-extra-class')
    // Default variant consumes the Tier-3 component token (defaults to --primary).
    expect(button.className).toContain('bg-button')
  })

  it('renders as the child element (Slot) instead of a button when asChild is set', () => {
    render(
      <Button asChild>
        <a href="/somewhere">Link button</a>
      </Button>
    )
    const link = screen.getByRole('link', { name: 'Link button' })
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', '/somewhere')
    // Slot still applies the button's computed classes onto the rendered child.
    expect(link.className).toContain('bg-button')
  })

  it('forwards the ref to the underlying button element', () => {
    const ref = createRef<HTMLButtonElement>()
    render(<Button ref={ref}>Go</Button>)
    expect(ref.current).toBeInstanceOf(HTMLButtonElement)
  })
})
