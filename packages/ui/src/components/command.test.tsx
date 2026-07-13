import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from './command'

function ExamplePalette({ open = true }: { open?: boolean }) {
  return (
    <CommandDialog open={open}>
      <CommandInput placeholder="Search…" data-testid="palette-input" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Navigation">
          <CommandItem value="Dashboard" data-testid="item-dashboard">
            Dashboard
          </CommandItem>
          <CommandItem value="Settings" data-testid="item-settings">
            Settings
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

describe('Command', () => {
  it('renders nothing while the dialog is closed', () => {
    render(<ExamplePalette open={false} />)
    expect(screen.queryByPlaceholderText('Search…')).not.toBeInTheDocument()
  })

  it('renders the input, group heading and items when open', () => {
    render(<ExamplePalette />)
    expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument()
    expect(screen.getByText('Navigation')).toBeInTheDocument()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('forwards data-testid to the input and items', () => {
    render(<ExamplePalette />)
    expect(screen.getByTestId('palette-input')).toBeInTheDocument()
    expect(screen.getByTestId('item-dashboard')).toBeInTheDocument()
    expect(screen.getByTestId('item-settings')).toBeInTheDocument()
  })
})
