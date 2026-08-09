import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './select'

// Radix Select's open menu relies on browser-only APIs; the pointer-capture stubs in
// `vitest.setup.ts` are what let the open path be driven here at all. Layout is still
// jsdom's — anything about *size* of the open menu is the Storybook browser tests'.
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

  it('opens on the whole list, and reports the picked option', async () => {
    const onValueChange = vi.fn()
    renderSelect({ onValueChange })

    await userEvent.click(screen.getByRole('combobox', { name: 'Theme' }))
    expect(screen.getAllByRole('option')).toHaveLength(2)

    await userEvent.click(screen.getByRole('option', { name: 'Beta' }))
    expect(onValueChange).toHaveBeenCalledWith('b')
  })

  /** The trigger's one-line clamp is aimed at the value. Aimed at `[&>span]` (shadcn's own rule) it
   * hits any span a caller renders beside it and switches it to `display: -webkit-box`, which drops
   * the layout of an icon + label row — so the value carries the slot the clamp selects on. */
  it('marks the value so the trigger clamps it and nothing else', () => {
    renderSelect({ value: 'a' })
    const trigger = screen.getByRole('combobox', { name: 'Theme' })
    expect(trigger.querySelector('[data-slot="select-value"]')).toBeInTheDocument()
    expect(trigger.className).not.toContain('[&>span]:line-clamp-1')
  })

  /** The viewport is `overflow: hidden auto`, so a height pinned to the *trigger* collapses the menu
   * to one scrolling row — which is what shadcn's own popper branch does. Its height must come from
   * the content it holds, bounded by the content's `max-h-96`. */
  it('never pins the open menu to the trigger’s height', async () => {
    renderSelect()
    await userEvent.click(screen.getByRole('combobox', { name: 'Theme' }))

    const viewport = document.querySelector('[data-radix-select-viewport]')
    expect(viewport?.className).not.toContain('radix-select-trigger-height')
  })
})
