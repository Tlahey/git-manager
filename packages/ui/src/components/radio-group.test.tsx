import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { RadioGroup, RadioGroupItem } from './radio-group'

function Fixture({ onValueChange }: { onValueChange?: (v: string) => void }) {
  const [value, setValue] = useState('comfortable')
  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => {
        setValue(v)
        onValueChange?.(v)
      }}
      aria-label="Density"
    >
      <RadioGroupItem value="compact" aria-label="Compact" />
      <RadioGroupItem value="comfortable" aria-label="Comfortable" />
    </RadioGroup>
  )
}

describe('RadioGroup', () => {
  it('renders a radiogroup with radio items', () => {
    render(<Fixture />)
    expect(screen.getByRole('radiogroup', { name: 'Density' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(2)
  })

  it('marks the item matching the value as checked', () => {
    render(<Fixture />)
    expect(screen.getByRole('radio', { name: 'Comfortable' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Compact' })).not.toBeChecked()
  })

  it('fires onValueChange when another item is selected', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Fixture onValueChange={onValueChange} />)
    await user.click(screen.getByRole('radio', { name: 'Compact' }))
    expect(onValueChange).toHaveBeenCalledWith('compact')
    expect(screen.getByRole('radio', { name: 'Compact' })).toBeChecked()
  })

  it('shares a single name across items so they group natively', () => {
    render(<Fixture />)
    const [a, b] = screen.getAllByRole('radio') as HTMLInputElement[]
    expect(a.name).toBe(b.name)
    expect(a.name).not.toBe('')
  })

  it('disables all items when the group is disabled', () => {
    render(
      <RadioGroup value="a" disabled aria-label="G">
        <RadioGroupItem value="a" aria-label="A" />
        <RadioGroupItem value="b" aria-label="B" />
      </RadioGroup>
    )
    expect(screen.getByRole('radio', { name: 'A' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'B' })).toBeDisabled()
  })

  it('throws when an item is used outside a group', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<RadioGroupItem value="x" />)).toThrow()
    spy.mockRestore()
  })

  // The selected indicator is aria-hidden, so axe/APCA can't grade it. Pin it to the
  // graded badge PAIR — the ring fills with bg-badge and the centre dot is
  // bg-badge-foreground — so contrast holds on every theme AND surface (a bg-badge dot
  // on a bg-background interior collapsed to ~1:1 on the chrome surface). Never raw
  // primary. Exposes the ground/mark markers the graphical-contrast gate keys off.
  it('uses the graded badge pair for the selected indicator, not raw primary', () => {
    const { container } = render(<Fixture />)
    const html = container.innerHTML
    expect(html).toContain('peer-checked:bg-badge') // ring fills with badge
    expect(html).toContain('bg-badge-foreground') // centre dot
    expect(html).toContain('data-contrast-ground')
    expect(html).toContain('data-contrast-mark="radio-dot"')
    expect(html).not.toContain('bg-primary')
  })
})
