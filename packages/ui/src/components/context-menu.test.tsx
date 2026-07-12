import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
} from './context-menu'

function ExampleMenu({ onSelectRename = vi.fn() } = {}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>Right-click zone</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>File actions</ContextMenuLabel>
        <ContextMenuItem onSelect={onSelectRename}>Rename</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

describe('ContextMenu', () => {
  it('is closed by default', () => {
    render(<ExampleMenu />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('opens on right-click (contextmenu) at the trigger, not on a plain left click', async () => {
    const user = userEvent.setup()
    render(<ExampleMenu />)
    await user.click(screen.getByText('Right-click zone'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    fireEvent.contextMenu(screen.getByText('Right-click zone'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument()
    expect(screen.getByText('File actions')).toBeInTheDocument()
  })

  it('calls onSelect and closes when an item is chosen', async () => {
    const user = userEvent.setup()
    const onSelectRename = vi.fn()
    render(<ExampleMenu onSelectRename={onSelectRename} />)
    fireEvent.contextMenu(screen.getByText('Right-click zone'))
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }))

    expect(onSelectRename).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    render(<ExampleMenu />)
    fireEvent.contextMenu(screen.getByText('Right-click zone'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
