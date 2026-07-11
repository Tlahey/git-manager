import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitBranch } from '@git-manager/git-types'
import { BranchItem } from './BranchItem'

vi.mock('./HoverExpandLabel', () => ({
  HoverExpandLabel: ({ children, className }: { children: React.ReactNode; className?: string }) => <span className={className}>{children}</span>,
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
    render(<BranchItem branch={branch({ shortName: 'main', isHead: true })} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('●')).toBeInTheDocument()
  })

  it('applies the selected background when isSelected', () => {
    const { container } = render(<BranchItem branch={branch()} isSelected onSelect={vi.fn()} />)
    expect(container.firstElementChild).toHaveClass('bg-accent')
  })

  it('shows ahead/behind counts only when non-zero', () => {
    const { rerender } = render(<BranchItem branch={branch()} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.queryByText(/↑/)).not.toBeInTheDocument()

    rerender(<BranchItem branch={branch({ aheadCount: 2, behindCount: 3 })} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.getByText('↑2')).toBeInTheDocument()
    expect(screen.getByText('↓3')).toBeInTheDocument()
  })
})

describe('BranchItem — interaction', () => {
  it('selects the branch on click and Enter', () => {
    const onSelect = vi.fn()
    render(<BranchItem branch={branch({ shortName: 'feature-x' })} isSelected={false} onSelect={onSelect} />)
    const row = screen.getByText('feature-x').closest('[role="button"]')!

    fireEvent.click(row)
    expect(onSelect).toHaveBeenCalledWith('feature-x')

    onSelect.mockClear()
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('feature-x')
  })

  it('opens the context menu via right-click', () => {
    const onContextMenu = vi.fn()
    render(<BranchItem branch={branch()} isSelected={false} onSelect={vi.fn()} onContextMenu={onContextMenu} />)
    fireEvent.contextMenu(screen.getByText('feature-x'))
    expect(onContextMenu).toHaveBeenCalled()
  })

  it('opens the context menu via the ⋮ button, without selecting the branch', async () => {
    const onSelect = vi.fn()
    const onContextMenu = vi.fn()
    const user = userEvent.setup()
    render(<BranchItem branch={branch()} isSelected={false} onSelect={onSelect} onContextMenu={onContextMenu} />)
    await user.click(screen.getByLabelText('Actions pour feature-x'))
    expect(onContextMenu).toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('BranchItem — pin button', () => {
  it('is hidden when onTogglePin is not given', () => {
    render(<BranchItem branch={branch()} isSelected={false} onSelect={vi.fn()} />)
    expect(screen.queryByLabelText(/pingler/)).not.toBeInTheDocument()
  })

  it('is hidden when canPin is false, even with onTogglePin', () => {
    render(<BranchItem branch={branch()} isSelected={false} onSelect={vi.fn()} onTogglePin={vi.fn()} canPin={false} />)
    expect(screen.queryByLabelText(/pingler/)).not.toBeInTheDocument()
  })

  it('toggles pin without selecting the branch', async () => {
    const onSelect = vi.fn()
    const onTogglePin = vi.fn()
    const user = userEvent.setup()
    render(<BranchItem branch={branch({ shortName: 'feature-x' })} isSelected={false} onSelect={onSelect} onTogglePin={onTogglePin} isPinned />)
    await user.click(screen.getByLabelText('Désépingler feature-x'))
    expect(onTogglePin).toHaveBeenCalledWith('feature-x')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('shows the "épingler" label when not pinned', () => {
    render(<BranchItem branch={branch({ shortName: 'feature-x' })} isSelected={false} onSelect={vi.fn()} onTogglePin={vi.fn()} isPinned={false} />)
    expect(screen.getByLabelText('Épingler feature-x')).toBeInTheDocument()
  })
})
