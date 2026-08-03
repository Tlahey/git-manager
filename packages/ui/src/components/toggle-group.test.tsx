import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { ToggleGroup, type ToggleGroupOption } from './toggle-group'

const options: ToggleGroupOption<'tree' | 'list'>[] = [
  { value: 'tree', icon: <svg data-testid="icon-tree" />, label: 'Tree structure' },
  { value: 'list', icon: <svg data-testid="icon-list" />, label: 'Flat list' },
]

function Fixture({ onValueChange }: { onValueChange?: (v: 'tree' | 'list') => void }) {
  const [value, setValue] = useState<'tree' | 'list'>('tree')
  return (
    <ToggleGroup
      value={value}
      onValueChange={(v) => {
        setValue(v)
        onValueChange?.(v)
      }}
      options={options}
    />
  )
}

describe('ToggleGroup', () => {
  it('renders one radio per option, named by its label (no raw title=)', () => {
    render(<Fixture />)
    expect(screen.getByRole('radio', { name: 'Tree structure' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Flat list' })).toBeInTheDocument()
  })

  it('marks the option matching value as checked', () => {
    render(<Fixture />)
    expect(screen.getByRole('radio', { name: 'Tree structure' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Flat list' })).not.toBeChecked()
  })

  it('shares a single name across options so they group natively', () => {
    render(<Fixture />)
    const [a, b] = screen.getAllByRole('radio') as HTMLInputElement[]
    expect(a.name).toBe(b.name)
    expect(a.name).not.toBe('')
  })

  it('fires onValueChange and flips the checked option when another is selected', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Fixture onValueChange={onValueChange} />)
    await user.click(screen.getByRole('radio', { name: 'Flat list' }))
    expect(onValueChange).toHaveBeenCalledWith('list')
    expect(screen.getByRole('radio', { name: 'Flat list' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Tree structure' })).not.toBeChecked()
  })

  it('hides the icon from assistive tech so only the sr-only label is announced', () => {
    render(<Fixture />)
    expect(screen.getByTestId('icon-tree').closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('respects an explicit shared name', () => {
    render(<Fixture />)
    render(<ToggleGroup value="tree" onValueChange={() => {}} options={options} name="view-mode" />)
    const radios = screen.getAllByRole('radio', { name: 'Tree structure' }) as HTMLInputElement[]
    expect(radios.at(-1)?.name).toBe('view-mode')
  })
})
