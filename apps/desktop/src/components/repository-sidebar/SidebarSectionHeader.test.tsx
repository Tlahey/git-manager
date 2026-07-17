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

  it('shows a branch-actions menu on the local section whose item fires onRemoveMergedBranches', async () => {
    const user = userEvent.setup()
    const onRemoveMergedBranches = vi.fn()
    render(
      <SidebarSectionHeader
        sectionKey="local"
        title="Local"
        isOpen={true}
        onToggle={vi.fn()}
        onCreateBranch={vi.fn()}
        onRemoveMergedBranches={onRemoveMergedBranches}
      />
    )
    await user.click(screen.getByTestId('branch-actions-menu-trigger'))
    await user.click(screen.getByTestId('branch-remove-merged-menu-item'))
    expect(onRemoveMergedBranches).toHaveBeenCalledOnce()
  })

  it('hides the branch-actions menu when neither prune nor remove-merged is given', () => {
    render(
      <SidebarSectionHeader
        sectionKey="local"
        title="Local"
        isOpen={true}
        onToggle={vi.fn()}
        onCreateBranch={vi.fn()}
      />
    )
    expect(screen.queryByTestId('branch-actions-menu-trigger')).not.toBeInTheDocument()
  })

  it('fires onPruneBranches from the branch-actions menu, and shows the menu on prune alone', async () => {
    const user = userEvent.setup()
    const onPruneBranches = vi.fn()
    render(
      <SidebarSectionHeader
        sectionKey="local"
        title="Local"
        isOpen={true}
        onToggle={vi.fn()}
        onPruneBranches={onPruneBranches}
      />
    )
    await user.click(screen.getByTestId('branch-actions-menu-trigger'))
    await user.click(screen.getByTestId('branch-prune-menu-item'))
    expect(onPruneBranches).toHaveBeenCalledOnce()
  })

  it('fires onRemoveMyMergedBranches from the branch-actions menu', async () => {
    const user = userEvent.setup()
    const onRemoveMyMergedBranches = vi.fn()
    render(
      <SidebarSectionHeader
        sectionKey="local"
        title="Local"
        isOpen={true}
        onToggle={vi.fn()}
        onRemoveMyMergedBranches={onRemoveMyMergedBranches}
      />
    )
    await user.click(screen.getByTestId('branch-actions-menu-trigger'))
    await user.click(screen.getByTestId('branch-remove-my-merged-menu-item'))
    expect(onRemoveMyMergedBranches).toHaveBeenCalledOnce()
  })

  it('fires onRemoveMyMergedWorktrees from the worktree-actions menu', async () => {
    const user = userEvent.setup()
    const onRemoveMyMergedWorktrees = vi.fn()
    render(
      <SidebarSectionHeader
        sectionKey="worktrees"
        title="Worktrees"
        isOpen={true}
        onToggle={vi.fn()}
        onRemoveMyMergedWorktrees={onRemoveMyMergedWorktrees}
      />
    )
    await user.click(screen.getByTestId('worktree-actions-menu-trigger'))
    await user.click(screen.getByTestId('worktree-remove-my-merged-menu-item'))
    expect(onRemoveMyMergedWorktrees).toHaveBeenCalledOnce()
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

  it('shows the worktree-actions menu only for the worktrees section with onPruneWorktrees, and its prune item fires the callback', async () => {
    const user = userEvent.setup()
    const onPruneWorktrees = vi.fn()
    render(
      <SidebarSectionHeader
        sectionKey="worktrees"
        title="Worktrees"
        isOpen={true}
        onToggle={vi.fn()}
        onPruneWorktrees={onPruneWorktrees}
      />
    )
    await user.click(screen.getByTestId('worktree-actions-menu-trigger'))
    await user.click(screen.getByTestId('worktree-prune-menu-item'))
    expect(onPruneWorktrees).toHaveBeenCalledOnce()
  })

  it('hides the worktree-actions menu for a non-worktrees section', () => {
    render(
      <SidebarSectionHeader
        sectionKey="local"
        title="Local"
        isOpen={true}
        onToggle={vi.fn()}
        onPruneWorktrees={vi.fn()}
      />
    )
    expect(screen.queryByTestId('worktree-actions-menu-trigger')).not.toBeInTheDocument()
  })

  it('shows the worktree-actions menu for onRemoveMergedWorktrees alone, and its item fires the callback', async () => {
    const user = userEvent.setup()
    const onRemoveMergedWorktrees = vi.fn()
    render(
      <SidebarSectionHeader
        sectionKey="worktrees"
        title="Worktrees"
        isOpen={true}
        onToggle={vi.fn()}
        onRemoveMergedWorktrees={onRemoveMergedWorktrees}
      />
    )
    await user.click(screen.getByTestId('worktree-actions-menu-trigger'))
    await user.click(screen.getByTestId('worktree-remove-merged-menu-item'))
    expect(onRemoveMergedWorktrees).toHaveBeenCalledOnce()
  })

  it('renders both menu items together when both callbacks are provided', async () => {
    const user = userEvent.setup()
    const onPruneWorktrees = vi.fn()
    const onRemoveMergedWorktrees = vi.fn()
    render(
      <SidebarSectionHeader
        sectionKey="worktrees"
        title="Worktrees"
        isOpen={true}
        onToggle={vi.fn()}
        onPruneWorktrees={onPruneWorktrees}
        onRemoveMergedWorktrees={onRemoveMergedWorktrees}
      />
    )
    await user.click(screen.getByTestId('worktree-actions-menu-trigger'))
    expect(screen.getByTestId('worktree-prune-menu-item')).toBeInTheDocument()
    expect(screen.getByTestId('worktree-remove-merged-menu-item')).toBeInTheDocument()
  })

  it('renders both the actions menu and the add button together for the worktrees section', async () => {
    const user = userEvent.setup()
    const onAddWorktree = vi.fn()
    const onPruneWorktrees = vi.fn()
    render(
      <SidebarSectionHeader
        sectionKey="worktrees"
        title="Worktrees"
        isOpen={true}
        onToggle={vi.fn()}
        onAddWorktree={onAddWorktree}
        onPruneWorktrees={onPruneWorktrees}
      />
    )
    await user.click(screen.getByTestId('worktree-actions-menu-trigger'))
    await user.click(screen.getByTestId('worktree-prune-menu-item'))
    await user.click(screen.getByTestId('worktree-add-button'))
    expect(onPruneWorktrees).toHaveBeenCalledOnce()
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
