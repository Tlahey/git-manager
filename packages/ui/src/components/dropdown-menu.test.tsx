import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from './dropdown-menu'

function ExampleMenu({ onSelectRename = vi.fn(), onSelectDelete = vi.fn() } = {}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={onSelectRename}>Rename</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSelectDelete} disabled>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

describe('DropdownMenu', () => {
  it('is closed by default', () => {
    render(<ExampleMenu />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('opens on trigger click and lists its items', async () => {
    const user = userEvent.setup()
    render(<ExampleMenu />)
    await user.click(screen.getByText('Actions'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
  })

  it('calls onSelect and closes the menu when an item is chosen', async () => {
    const user = userEvent.setup()
    const onSelectRename = vi.fn()
    render(<ExampleMenu onSelectRename={onSelectRename} />)
    await user.click(screen.getByText('Actions'))
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }))

    expect(onSelectRename).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('does not fire onSelect for a disabled item', async () => {
    const user = userEvent.setup()
    const onSelectDelete = vi.fn()
    render(<ExampleMenu onSelectDelete={onSelectDelete} />)
    await user.click(screen.getByText('Actions'))
    const deleteItem = screen.getByRole('menuitem', { name: 'Delete' })
    expect(deleteItem).toHaveAttribute('data-disabled')
    await user.click(deleteItem)
    expect(onSelectDelete).not.toHaveBeenCalled()
  })

  it('renders a separator between groups of items', async () => {
    const user = userEvent.setup()
    render(<ExampleMenu />)
    await user.click(screen.getByText('Actions'))
    expect(screen.getByRole('separator')).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    render(<ExampleMenu />)
    await user.click(screen.getByText('Actions'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('expands a submenu to reveal nested items', async () => {
    const user = userEvent.setup()
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>More</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Nested</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    )
    await user.click(screen.getByText('Actions'))
    const subTrigger = screen.getByText('More')
    expect(subTrigger).toBeInTheDocument()
    await user.click(subTrigger)
    expect(await screen.findByRole('menuitem', { name: 'Nested' })).toBeInTheDocument()
  })
})
