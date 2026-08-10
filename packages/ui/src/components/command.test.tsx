import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from './command'

function ExamplePalette({
  open = true,
  filter,
}: {
  open?: boolean
  filter?: (value: string, search: string, keywords?: string[]) => number
}) {
  return (
    <CommandDialog open={open} filter={filter}>
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

  // Callers whose rows cmdk's own subsequence scorer reads wrongly — refs, paths — pass their own.
  it("filters and ranks with the caller's own scorer when one is given", async () => {
    const user = userEvent.setup()
    // Keeps only the row that contains the query, where cmdk's own scorer accepts `dsh` for both.
    const filter = vi.fn((value: string, search: string) =>
      value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
    )
    render(<ExamplePalette filter={filter} />)

    await user.type(screen.getByTestId('palette-input'), 'dsh')

    expect(filter).toHaveBeenCalled()
    expect(screen.queryByTestId('item-dashboard')).not.toBeInTheDocument()
    expect(screen.queryByTestId('item-settings')).not.toBeInTheDocument()
  })

  it('leaves cmdk its own scorer when none is given', async () => {
    const user = userEvent.setup()
    render(<ExamplePalette />)

    await user.type(screen.getByTestId('palette-input'), 'dsh')

    // cmdk accepts a subsequence — d, s, h scattered through "Dashboard".
    expect(screen.getByTestId('item-dashboard')).toBeInTheDocument()
    expect(screen.queryByTestId('item-settings')).not.toBeInTheDocument()
  })
})
