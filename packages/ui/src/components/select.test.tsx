import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './select'

// Radix Select's open menu relies on browser-only APIs (pointer capture, layout)
// that jsdom lacks; the interactive open/select path is covered by the Storybook
// browser tests. Here we smoke-test the closed trigger, which is safe in jsdom.
describe('Select', () => {
  function renderSelect(props?: React.ComponentProps<typeof Select>) {
    return render(
      <Select {...props}>
        <SelectTrigger aria-label="Theme">
          <SelectValue placeholder="Pick a theme" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Alpha</SelectItem>
          <SelectItem value="b">Beta</SelectItem>
        </SelectContent>
      </Select>
    )
  }

  it('renders an accessible combobox trigger with the placeholder', () => {
    renderSelect()
    expect(screen.getByRole('combobox', { name: 'Theme' })).toBeInTheDocument()
    expect(screen.getByText('Pick a theme')).toBeInTheDocument()
  })

  it('is disabled when the disabled prop is set', () => {
    renderSelect({ disabled: true })
    expect(screen.getByRole('combobox', { name: 'Theme' })).toBeDisabled()
  })
})
