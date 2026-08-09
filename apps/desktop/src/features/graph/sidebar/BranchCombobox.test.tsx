import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// cmdk + Popover internals are brittle in jsdom (same rationale as CommandPalette.test.tsx); fake the
// primitives down to a plain always-open list so we can test the combobox's own wiring: option
// rendering, the in-use flag, and onChange on select.
vi.mock('@git-manager/ui', () => ({
  cn: (...c: unknown[]) => c.filter(Boolean).join(' '),
  Button: ({ children, ...p }: { children: React.ReactNode }) => <button {...p}>{children}</button>,
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandInput: (p: { placeholder?: string; 'data-testid'?: string }) => (
    <input placeholder={p.placeholder} data-testid={p['data-testid']} />
  ),
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandItem: (props: {
    children: React.ReactNode
    onSelect: () => void
    'data-testid'?: string
  }) => (
    <button type="button" onClick={props.onSelect} data-testid={props['data-testid']}>
      {props.children}
    </button>
  ),
}))

import { BranchCombobox } from './BranchCombobox'

const branches = [
  { shortName: 'main', isCheckedOut: true },
  { shortName: 'feature/login', isCheckedOut: false },
]

function renderCombobox(props: Partial<React.ComponentProps<typeof BranchCombobox>> = {}) {
  return render(
    <BranchCombobox
      branches={branches}
      value="main"
      onChange={vi.fn()}
      placeholder="Select a branch"
      searchPlaceholder="Search…"
      emptyLabel="No branch found."
      inUseLabel="in a worktree"
      {...props}
    />
  )
}

describe('BranchCombobox', () => {
  it('shows the selected branch on the trigger', () => {
    renderCombobox({ value: 'feature/login' })
    expect(screen.getByTestId('worktree-add-branch-select')).toHaveTextContent('feature/login')
  })

  it('falls back to the placeholder when nothing is selected', () => {
    renderCombobox({ value: '' })
    expect(screen.getByTestId('worktree-add-branch-select')).toHaveTextContent('Select a branch')
  })

  it('keeps the dropdown closed until the trigger is clicked', async () => {
    const user = userEvent.setup()
    renderCombobox()
    expect(screen.queryByTestId('worktree-add-branch-option-main')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('worktree-add-branch-select'))
    expect(screen.getByTestId('worktree-add-branch-option-main')).toBeInTheDocument()
  })

  it('renders every branch and flags the ones already in a worktree', async () => {
    const user = userEvent.setup()
    renderCombobox()
    await user.click(screen.getByTestId('worktree-add-branch-select'))
    expect(screen.getByTestId('worktree-add-branch-option-main')).toHaveTextContent('in a worktree')
    expect(screen.getByTestId('worktree-add-branch-option-feature/login')).not.toHaveTextContent(
      'in a worktree'
    )
  })

  it('calls onChange with the chosen branch', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    renderCombobox({ onChange })
    await user.click(screen.getByTestId('worktree-add-branch-select'))
    await user.click(screen.getByTestId('worktree-add-branch-option-feature/login'))
    expect(onChange).toHaveBeenCalledWith('feature/login')
  })
})
