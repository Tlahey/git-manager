import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { NativeSelect } from './native-select'

function options() {
  return (
    <>
      <option value="a">Alpha</option>
      <option value="b">Beta</option>
    </>
  )
}

describe('NativeSelect', () => {
  it('renders a native combobox with its options', () => {
    render(
      <NativeSelect aria-label="Letters" defaultValue="a">
        {options()}
      </NativeSelect>
    )
    const select = screen.getByRole('combobox', { name: 'Letters' }) as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    expect(select.value).toBe('a')
  })

  it('fires onChange and reflects the new value when the user selects', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <NativeSelect aria-label="Letters" defaultValue="a" onChange={onChange}>
        {options()}
      </NativeSelect>
    )
    const select = screen.getByRole('combobox', { name: 'Letters' }) as HTMLSelectElement
    await user.selectOptions(select, 'b')
    expect(onChange).toHaveBeenCalled()
    expect(select.value).toBe('b')
  })

  it('is disabled when the disabled prop is set', () => {
    render(
      <NativeSelect aria-label="Letters" disabled>
        {options()}
      </NativeSelect>
    )
    expect(screen.getByRole('combobox', { name: 'Letters' })).toBeDisabled()
  })

  it('merges a custom className over the base (caller wins on conflicts)', () => {
    render(
      <NativeSelect aria-label="Letters" className="h-7 text-[10px]">
        {options()}
      </NativeSelect>
    )
    const cls = screen.getByRole('combobox', { name: 'Letters' }).className
    expect(cls).toContain('h-7')
    expect(cls).toContain('text-[10px]')
    expect(cls).not.toContain('h-8') // tailwind-merge drops the base height
  })

  it('forwards the ref to the underlying select element', () => {
    const ref = createRef<HTMLSelectElement>()
    render(
      <NativeSelect aria-label="Letters" ref={ref}>
        {options()}
      </NativeSelect>
    )
    expect(ref.current).toBeInstanceOf(HTMLSelectElement)
  })
})
