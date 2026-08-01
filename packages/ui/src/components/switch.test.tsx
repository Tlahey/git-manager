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

  // Regression guard. jsdom has no layout or hit-testing, so a test cannot literally click the
  // painted track/thumb — but the invariant that broke is structural and can be pinned: the input
  // must stretch over the whole control. When it was `sr-only` the browser clipped it to 1px, and
  // since the track/thumb are `pointer-events-none`, a `<Switch>` used outside a `<label>` had no
  // clickable surface at all — see Checkbox's identical regression test/fix for the same bug class.
  it('stretches the input over the whole control so the visible track is the hit area', () => {
    render(<Switch aria-label="Notifications" />)
    const input = screen.getByRole('switch', { name: 'Notifications' })
    expect(input.className).not.toContain('sr-only')
    expect(input.className).toContain('absolute')
    expect(input.className).toContain('inset-0')
    expect(input.className).toContain('h-full')
    expect(input.className).toContain('w-full')
    expect(input.className).toContain('cursor-pointer')
  })

  it('keeps the input invisible without removing it from the accessibility tree', () => {
    render(<Switch aria-label="Notifications" />)
    const input = screen.getByRole('switch', { name: 'Notifications' })
    // opacity-0, never display:none/hidden — it must stay focusable and exposed to AT.
    expect(input.className).toContain('opacity-0')
    expect(input.className).not.toContain('hidden')
    expect(input).toBeVisible()
  })

  it('toggles from a click without needing a wrapping label', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Switch aria-label="Notifications" checked={false} onChange={onChange} />)
    await user.click(screen.getByRole('switch', { name: 'Notifications' }))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('still toggles exactly once when wrapped in a label', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <label>
        <Switch aria-label="Notifications" checked={false} onChange={onChange} />
        <span>Enable notifications</span>
      </label>
    )
    // Clicking the text goes through the label; the input must not also fire a second time.
    await user.click(screen.getByText('Enable notifications'))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('shows the not-allowed cursor and dims the track/thumb when disabled', () => {
    const { container } = render(<Switch aria-label="Notifications" disabled />)
    const input = screen.getByRole('switch', { name: 'Notifications' })
    expect(input.className).toContain('disabled:cursor-not-allowed')
    expect(container.innerHTML).toContain('peer-disabled:opacity-50')
  })
})
