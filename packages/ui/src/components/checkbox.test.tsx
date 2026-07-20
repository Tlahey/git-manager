import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { Checkbox } from './checkbox'

describe('Checkbox', () => {
  it('renders a native checkbox input', () => {
    render(<Checkbox aria-label="Accept" />)
    const box = screen.getByRole('checkbox', { name: 'Accept' }) as HTMLInputElement
    expect(box.type).toBe('checkbox')
  })

  it('toggles and fires onChange when clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Checkbox aria-label="Accept" onChange={onChange} />)
    await user.click(screen.getByRole('checkbox', { name: 'Accept' }))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('is toggleable with the keyboard (Space)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Checkbox aria-label="Accept" onChange={onChange} />)
    await user.tab()
    expect(screen.getByRole('checkbox', { name: 'Accept' })).toHaveFocus()
    await user.keyboard(' ')
    expect(onChange).toHaveBeenCalled()
  })

  it('reflects the checked prop', () => {
    render(<Checkbox aria-label="Accept" checked readOnly />)
    expect(screen.getByRole('checkbox', { name: 'Accept' })).toBeChecked()
  })

  it('exposes the mixed state and indeterminate DOM flag', () => {
    render(<Checkbox aria-label="Accept" indeterminate />)
    const box = screen.getByRole('checkbox', { name: 'Accept' }) as HTMLInputElement
    expect(box).toHaveAttribute('aria-checked', 'mixed')
    expect(box.indeterminate).toBe(true)
  })

  it('is disabled and unfocusable when disabled', () => {
    render(<Checkbox aria-label="Accept" disabled />)
    expect(screen.getByRole('checkbox', { name: 'Accept' })).toBeDisabled()
  })

  it('forwards the ref to the underlying input', () => {
    const ref = createRef<HTMLInputElement>()
    render(<Checkbox aria-label="Accept" ref={ref} />)
    expect(ref.current).toBeInstanceOf(HTMLInputElement)
    expect(ref.current?.type).toBe('checkbox')
  })

  it('merges a custom className onto the wrapper', () => {
    render(<Checkbox aria-label="Accept" className="extra-class" />)
    const box = screen.getByRole('checkbox', { name: 'Accept' })
    expect(box.parentElement?.className).toContain('extra-class')
  })

  // The checked fill + checkmark are aria-hidden, so axe/APCA can't grade their
  // contrast — they'd silently regress. Pin them to the `badge` component-token pair
  // (graded by @git-manager/theme, re-pointed to a deep APCA-safe fill on light
  // themes like Twilight where raw --primary fails), NOT raw primary.
  it('fills with the graded badge token, not raw primary', () => {
    const { container } = render(<Checkbox aria-label="Accept" />)
    const wrapperHtml = container.innerHTML
    expect(wrapperHtml).toContain('peer-checked:bg-badge')
    expect(wrapperHtml).toContain('text-badge-foreground')
    expect(wrapperHtml).not.toContain('peer-checked:bg-primary')
    expect(wrapperHtml).not.toContain('text-primary-foreground')
  })
})
