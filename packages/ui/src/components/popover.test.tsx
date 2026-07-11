import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Popover, PopoverTrigger, PopoverContent } from './popover'

function ExamplePopover() {
  return (
    <Popover>
      <PopoverTrigger>Open popover</PopoverTrigger>
      <PopoverContent>
        <input placeholder="Search…" />
      </PopoverContent>
    </Popover>
  )
}

describe('Popover', () => {
  it('is closed by default', () => {
    render(<ExamplePopover />)
    expect(screen.queryByPlaceholderText('Search…')).not.toBeInTheDocument()
  })

  it('opens its content on trigger click', async () => {
    const user = userEvent.setup()
    render(<ExamplePopover />)
    await user.click(screen.getByText('Open popover'))
    expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument()
  })

  it('allows typing into an internal input without the trigger stealing focus/keys', async () => {
    const user = userEvent.setup()
    render(<ExamplePopover />)
    await user.click(screen.getByText('Open popover'))
    const input = screen.getByPlaceholderText('Search…')
    await user.type(input, 'hello')
    expect(input).toHaveValue('hello')
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    render(<ExamplePopover />)
    await user.click(screen.getByText('Open popover'))
    expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByPlaceholderText('Search…')).not.toBeInTheDocument()
  })

  it('closes when clicking outside', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <div data-testid="outside">outside</div>
        <ExamplePopover />
      </div>
    )
    await user.click(screen.getByText('Open popover'))
    expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument()
    await user.click(screen.getByTestId('outside'))
    expect(screen.queryByPlaceholderText('Search…')).not.toBeInTheDocument()
  })
})
