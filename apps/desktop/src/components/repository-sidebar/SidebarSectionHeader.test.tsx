import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SidebarSectionHeader } from './SidebarSectionHeader'

describe('SidebarSectionHeader', () => {
  it('renders the title/count and toggles via onToggle', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(
      <SidebarSectionHeader
        sectionKey="local"
        title="Local"
        count={3}
        isOpen={true}
        onToggle={onToggle}
      />
    )
    expect(screen.getByText('Local')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    await user.click(screen.getByText('Local'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('shows the create-branch action only for the local section with onCreateBranch', async () => {
    const user = userEvent.setup()
    const onCreateBranch = vi.fn()
    render(
      <SidebarSectionHeader
        sectionKey="local"
        title="Local"
        isOpen={true}
        onToggle={vi.fn()}
        onCreateBranch={onCreateBranch}
      />
    )
    await user.click(screen.getByLabelText('Créer une branche'))
    expect(onCreateBranch).toHaveBeenCalledOnce()
  })

  it('hides the create-branch action for a non-local section', () => {
    render(
      <SidebarSectionHeader
        sectionKey="remotes"
        title="Remotes"
        isOpen={true}
        onToggle={vi.fn()}
        onCreateBranch={vi.fn()}
      />
    )
    expect(screen.queryByLabelText('Créer une branche')).not.toBeInTheDocument()
  })

  it('shows the add-worktree action only for the worktrees section with onAddWorktree', async () => {
    const user = userEvent.setup()
    const onAddWorktree = vi.fn()
    render(
      <SidebarSectionHeader
        sectionKey="worktrees"
        title="Worktrees"
        isOpen={true}
        onToggle={vi.fn()}
        onAddWorktree={onAddWorktree}
      />
    )
    await user.click(screen.getByTestId('worktree-add-button'))
    expect(onAddWorktree).toHaveBeenCalledOnce()
  })

  it('shows the create-PR action only for the prs section with onCreatePr', async () => {
    const user = userEvent.setup()
    const onCreatePr = vi.fn()
    render(
      <SidebarSectionHeader
        sectionKey="prs"
        title="Pull Requests"
        isOpen={true}
        onToggle={vi.fn()}
        onCreatePr={onCreatePr}
      />
    )
    await user.click(screen.getByTestId('pr-create-button'))
    expect(onCreatePr).toHaveBeenCalledOnce()
  })

  it('hides the create-PR action when onCreatePr is not provided', () => {
    render(
      <SidebarSectionHeader
        sectionKey="prs"
        title="Pull Requests"
        isOpen={true}
        onToggle={vi.fn()}
      />
    )
    expect(screen.queryByTestId('pr-create-button')).not.toBeInTheDocument()
  })

  it('forwards isFiltered to the underlying SectionHeader as a filter icon', () => {
    const { container, rerender } = render(
      <SidebarSectionHeader
        sectionKey="local"
        title="Local"
        count={2}
        isOpen={true}
        onToggle={vi.fn()}
      />
    )
    expect(container.querySelector('.lucide-filter')).toBeFalsy()

    rerender(
      <SidebarSectionHeader
        sectionKey="local"
        title="Local"
        count={2}
        isOpen={true}
        onToggle={vi.fn()}
        isFiltered
      />
    )
    expect(container.querySelector('.lucide-filter')).toBeTruthy()
  })
})
