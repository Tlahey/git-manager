import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitBranch } from '@git-manager/git-types'
import { BranchItem } from './BranchItem'

vi.mock('./HoverExpandLabel', () => ({
  HoverExpandLabel: ({
    children,
    className,
  }: {
    children: React.ReactNode
    className?: string
  }) => <span className={className}>{children}</span>,
}))

function branch(overrides: Partial<GitBranch> = {}): GitBranch {
  return {
    name: 'refs/heads/feature-x',
    shortName: 'feature-x',
    isHead: false,
    isRemote: false,
    commitOid: 'abc123',
    commitMessage: 'msg',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
    ...overrides,
  }
}

describe('BranchItem — rendering', () => {
  it('shows the branch name and a HEAD dot when it is the current branch', () => {
    render(
      <BranchItem
        branch={branch({ shortName: 'main', isHead: true })}
        isSelected={false}
        onSelect={vi.fn()}
      />
    )
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('●')).toBeInTheDocument()
  })

  it('applies the selected background when isSelected', () => {
    const { container } = render(<BranchItem branch={branch()} isSelected onSelect={vi.fn()} />)
    expect(container.firstElementChild).toHaveClass('bg-sidebar-accent')
  })

  it('renders displayName instead of the full shortName when provided, but still selects/pins by shortName', async () => {
    const onSelect = vi.fn()
    const onTogglePin = vi.fn()
    const user = userEvent.setup()
    render(
      <BranchItem
        branch={branch({ shortName: 'feat/ma_branche' })}
        displayName="ma_branche"
        isSelected={false}
        onSelect={onSelect}
        onTogglePin={onTogglePin}
      />
    )
    expect(screen.getByText('ma_branche')).toBeInTheDocument()
    expect(screen.queryByText('feat/ma_branche')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('ma_branche'))
    expect(onSelect).toHaveBeenCalledWith('feat/ma_branche')

    await user.click(screen.getByLabelText('Pin feat/ma_branche to the top'))
    expect(onTogglePin).toHaveBeenCalledWith('feat/ma_branche')
  })

  it('falls back to the full shortName when displayName is not provided', () => {
    render(<BranchItem branch={branch({ shortName: 'feat/a' })} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.getByText('feat/a')).toBeInTheDocument()
  })

  it('highlights the matched substring when filterQuery is provided', () => {
    const { container } = render(
      <BranchItem
        branch={branch({ shortName: 'feature-x' })}
        isSelected={false}
        onSelect={vi.fn()}
        filterQuery="eat"
      />
    )
    const mark = container.querySelector('mark')
    expect(mark?.textContent).toBe('eat')
    expect(container.textContent).toContain('feature-x')
  })

  it('renders the plain name with no <mark> when filterQuery is empty', () => {
    const { container } = render(
      <BranchItem branch={branch({ shortName: 'feature-x' })} isSelected={false} onSelect={vi.fn()} />
    )
    expect(container.querySelector('mark')).toBeFalsy()
  })

})

describe('BranchItem — interaction', () => {
  it('selects the branch on click and Enter', () => {
    const onSelect = vi.fn()
    render(
      <BranchItem
        branch={branch({ shortName: 'feature-x' })}
        isSelected={false}
        onSelect={onSelect}
      />
    )
    const row = screen.getByText('feature-x').closest('[role="button"]')!

    fireEvent.click(row)
    expect(onSelect).toHaveBeenCalledWith('feature-x')

    onSelect.mockClear()
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('feature-x')
  })

  // One click moves the view, a double click switches branch — switching is the one destructive-ish
  // thing the row can do, so it takes the deliberate gesture.
  it('focuses the branch tip on a single click, without checking it out', () => {
    const onFocus = vi.fn()
    const onCheckout = vi.fn()
    render(
      <BranchItem
        branch={branch({ shortName: 'feature-x', commitOid: 'abc123' })}
        isSelected={false}
        onSelect={vi.fn()}
        onFocus={onFocus}
        onCheckout={onCheckout}
      />
    )
    fireEvent.click(screen.getByText('feature-x').closest('[role="button"]')!)
    expect(onFocus).toHaveBeenCalledWith(expect.objectContaining({ shortName: 'feature-x' }))
    expect(onCheckout).not.toHaveBeenCalled()
  })

  it('checks the branch out on a double click', () => {
    const onCheckout = vi.fn()
    render(
      <BranchItem
        branch={branch({ shortName: 'feature-x' })}
        isSelected={false}
        onSelect={vi.fn()}
        onCheckout={onCheckout}
      />
    )
    fireEvent.doubleClick(screen.getByText('feature-x').closest('[role="button"]')!)
    expect(onCheckout).toHaveBeenCalledWith(expect.objectContaining({ shortName: 'feature-x' }))
  })

  // The actions button sits inside the row; without the guard, opening the menu would also move
  // the graph, and a quick second click on it would switch branch.
  it('ignores both gestures when they land on the actions button', () => {
    const onFocus = vi.fn()
    const onCheckout = vi.fn()
    render(
      <BranchItem
        branch={branch({ shortName: 'feature-x' })}
        isSelected={false}
        onSelect={vi.fn()}
        onFocus={onFocus}
        onCheckout={onCheckout}
        onContextMenu={vi.fn()}
      />
    )
    const actions = screen.getByTestId('branch-actions-feature-x')
    fireEvent.click(actions)
    fireEvent.doubleClick(actions)
    expect(onFocus).not.toHaveBeenCalled()
    expect(onCheckout).not.toHaveBeenCalled()
  })

  it('opens the context menu via right-click', () => {
    const onContextMenu = vi.fn()
    render(
      <BranchItem
        branch={branch()}
        isSelected={false}
        onSelect={vi.fn()}
        onContextMenu={onContextMenu}
      />
    )
    fireEvent.contextMenu(screen.getByText('feature-x'))
    expect(onContextMenu).toHaveBeenCalled()
  })

  it('opens the context menu via the ⋮ button, without selecting the branch', async () => {
    const onSelect = vi.fn()
    const onContextMenu = vi.fn()
    const user = userEvent.setup()
    render(
      <BranchItem
        branch={branch()}
        isSelected={false}
        onSelect={onSelect}
        onContextMenu={onContextMenu}
      />
    )
    await user.click(screen.getByTestId('branch-actions-feature-x'))
    expect(onContextMenu).toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('BranchItem — pin button', () => {
  it('is hidden when onTogglePin is not given', () => {
    render(<BranchItem branch={branch()} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.queryByLabelText(/^Pin /)).not.toBeInTheDocument()
  })

  it('is hidden when canPin is false, even with onTogglePin', () => {
    render(
      <BranchItem
        branch={branch()}
        isSelected={false}
        onSelect={vi.fn()}
        onTogglePin={vi.fn()}
        canPin={false}
      />
    )
    expect(screen.queryByLabelText(/^Pin /)).not.toBeInTheDocument()
  })

  it('toggles pin without selecting the branch', async () => {
    const onSelect = vi.fn()
    const onTogglePin = vi.fn()
    const user = userEvent.setup()
    render(
      <BranchItem
        branch={branch({ shortName: 'feature-x' })}
        isSelected={false}
        onSelect={onSelect}
        onTogglePin={onTogglePin}
        isPinned
      />
    )
    await user.click(screen.getByLabelText('Unpin feature-x'))
    expect(onTogglePin).toHaveBeenCalledWith('feature-x')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('names the action in the active language when the branch is not pinned', () => {
    render(
      <BranchItem
        branch={branch({ shortName: 'feature-x' })}
        isSelected={false}
        onSelect={vi.fn()}
        onTogglePin={vi.fn()}
        isPinned={false}
      />
    )
    expect(screen.getByLabelText('Pin feature-x to the top')).toBeInTheDocument()
  })
})

describe('BranchItem — solo toggle', () => {
  it('does not render the solo toggle when solo mode is off', () => {
    render(
      <BranchItem
        branch={branch()}
        isSelected={false}
        onSelect={vi.fn()}
        onToggleSolo={vi.fn()}
      />
    )
    expect(screen.queryByTestId('branch-solo-toggle')).not.toBeInTheDocument()
  })

  it('renders a "Show this branch" toggle for a hidden branch in solo mode', () => {
    render(
      <BranchItem
        branch={branch()}
        isSelected={false}
        onSelect={vi.fn()}
        soloActive
        isSoloed={false}
        onToggleSolo={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Show this branch')).toBeInTheDocument()
  })

  it('renders a "Hide this branch" toggle for a soloed branch in solo mode', () => {
    render(
      <BranchItem
        branch={branch()}
        isSelected={false}
        onSelect={vi.fn()}
        soloActive
        isSoloed
        onToggleSolo={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Hide this branch')).toBeInTheDocument()
  })

  it('dims a hidden branch row in solo mode', () => {
    const { container } = render(
      <BranchItem
        branch={branch()}
        isSelected={false}
        onSelect={vi.fn()}
        soloActive
        isSoloed={false}
        onToggleSolo={vi.fn()}
      />
    )
    expect(container.firstElementChild).toHaveClass('opacity-50')
  })

  it('toggles solo by shortName without selecting the branch', async () => {
    const onSelect = vi.fn()
    const onToggleSolo = vi.fn()
    const user = userEvent.setup()
    render(
      <BranchItem
        branch={branch({ shortName: 'feature-x' })}
        isSelected={false}
        onSelect={onSelect}
        soloActive
        isSoloed={false}
        onToggleSolo={onToggleSolo}
      />
    )
    await user.click(screen.getByTestId('branch-solo-toggle'))
    expect(onToggleSolo).toHaveBeenCalledWith('feature-x')
    expect(onSelect).not.toHaveBeenCalled()
  })
})

// The row carries neither the linked PR's tag nor the ahead/behind counters: it is a name and its
// actions, and both of those live where they can be read in full (the toolbar, the graph).
describe('BranchItem — what the row deliberately leaves out', () => {
  it('shows no PR tag', () => {
    render(<BranchItem branch={branch()} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.queryByTestId(/^pr-status-tag-/)).not.toBeInTheDocument()
  })

  it('shows no ahead/behind counters', () => {
    render(
      <BranchItem
        branch={branch({ aheadCount: 2, behindCount: 1 })}
        isSelected={false}
        onSelect={vi.fn()}
      />
    )
    expect(screen.queryByText(/↑2/)).not.toBeInTheDocument()
    expect(screen.queryByText(/↓1/)).not.toBeInTheDocument()
  })
})

describe('BranchItem — solo toggle', () => {
  it('does not render the solo toggle when solo mode is off', () => {
    render(
      <BranchItem
        branch={branch()}
        isSelected={false}
        onSelect={vi.fn()}
        onToggleSolo={vi.fn()}
      />
    )
    expect(screen.queryByTestId('branch-solo-toggle')).not.toBeInTheDocument()
  })

  it('renders a "Show this branch" toggle for a hidden branch in solo mode', () => {
    render(
      <BranchItem
        branch={branch()}
        isSelected={false}
        onSelect={vi.fn()}
        soloActive
        isSoloed={false}
        onToggleSolo={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Show this branch')).toBeInTheDocument()
  })

  it('renders a "Hide this branch" toggle for a soloed branch in solo mode', () => {
    render(
      <BranchItem
        branch={branch()}
        isSelected={false}
        onSelect={vi.fn()}
        soloActive
        isSoloed
        onToggleSolo={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Hide this branch')).toBeInTheDocument()
  })

  it('dims a hidden branch row in solo mode', () => {
    const { container } = render(
      <BranchItem
        branch={branch()}
        isSelected={false}
        onSelect={vi.fn()}
        soloActive
        isSoloed={false}
        onToggleSolo={vi.fn()}
      />
    )
    expect(container.firstElementChild).toHaveClass('opacity-50')
  })

  it('toggles solo by shortName without selecting the branch', async () => {
    const onSelect = vi.fn()
    const onToggleSolo = vi.fn()
    const user = userEvent.setup()
    render(
      <BranchItem
        branch={branch({ shortName: 'feature-x' })}
        isSelected={false}
        onSelect={onSelect}
        soloActive
        isSoloed={false}
        onToggleSolo={onToggleSolo}
      />
    )
    await user.click(screen.getByTestId('branch-solo-toggle'))
    expect(onToggleSolo).toHaveBeenCalledWith('feature-x')
    expect(onSelect).not.toHaveBeenCalled()
  })
})
