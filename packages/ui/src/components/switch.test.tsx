import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { Switch } from './switch'

describe('Switch', () => {
  it('exposes the switch role for assistive tech', () => {
    render(<Switch aria-label="Notifications" />)
    expect(screen.getByRole('switch', { name: 'Notifications' })).toBeInTheDocument()
  })

  it('toggles and fires onChange when clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Switch aria-label="Notifications" onChange={onChange} />)
    await user.click(screen.getByRole('switch', { name: 'Notifications' }))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('is toggleable with the keyboard (Space)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Switch aria-label="Notifications" onChange={onChange} />)
    await user.tab()
    expect(screen.getByRole('switch', { name: 'Notifications' })).toHaveFocus()
    await user.keyboard(' ')
    expect(onChange).toHaveBeenCalled()
  })

  it('reflects the checked prop', () => {
    render(<Switch aria-label="Notifications" checked readOnly />)
    expect(screen.getByRole('switch', { name: 'Notifications' })).toBeChecked()
  })

  it('is disabled when the disabled prop is set', () => {
    render(<Switch aria-label="Notifications" disabled />)
    expect(screen.getByRole('switch', { name: 'Notifications' })).toBeDisabled()
  })

  it('forwards the ref to the underlying input', () => {
    const ref = createRef<HTMLInputElement>()
    render(<Switch aria-label="Notifications" ref={ref} />)
    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })

  // The track fill + thumb are aria-hidden, so axe/APCA (text-only) can't grade their
  // contrast — pin them to graded token PAIRS so contrast is guaranteed by construction
  // on every theme: track on = bg-badge; thumb = muted-foreground over the off track
  // and badge-foreground over the on track. Never bg-background (near-black thumb on a
  // dark muted track in dark themes) or raw primary.
  it('uses graded token pairs for the track and thumb, not raw primary/background', () => {
    const { container } = render(<Switch aria-label="Notifications" />)
    const html = container.innerHTML
    expect(html).toContain('peer-checked:bg-badge') // on track
    expect(html).toContain('bg-muted-foreground') // thumb over off track
    expect(html).toContain('peer-checked:bg-badge-foreground') // thumb over on track
    expect(html).not.toContain('peer-checked:bg-primary')
    expect(html).not.toContain('bg-background')
  })
})
