import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BoardCardBranchSection } from './BoardCardBranchSection'

describe('BoardCardBranchSection', () => {
  it('offers to create a branch when none is linked', () => {
    render(
      <BoardCardBranchSection
        onCreateBranch={vi.fn()}
        onCheckoutBranch={vi.fn()}
        onUnlinkBranch={vi.fn()}
      />
    )
    expect(screen.getByText('No branch linked')).toBeInTheDocument()
    expect(screen.getByTestId('board-card-create-branch')).toBeInTheDocument()
    expect(screen.queryByTestId('board-card-checkout-branch')).not.toBeInTheDocument()
  })

  it('calls onCreateBranch when creating a branch', async () => {
    const onCreateBranch = vi.fn().mockResolvedValue(undefined)
    render(
      <BoardCardBranchSection
        onCreateBranch={onCreateBranch}
        onCheckoutBranch={vi.fn()}
        onUnlinkBranch={vi.fn()}
      />
    )
    await userEvent.click(screen.getByTestId('board-card-create-branch'))
    expect(onCreateBranch).toHaveBeenCalledTimes(1)
  })

  it('shows the linked branch with checkout/unlink actions instead of create', () => {
    render(
      <BoardCardBranchSection
        linkedBranch="feature/header"
        onCreateBranch={vi.fn()}
        onCheckoutBranch={vi.fn()}
        onUnlinkBranch={vi.fn()}
      />
    )
    expect(screen.getByText('feature/header')).toBeInTheDocument()
    expect(screen.getByTestId('board-card-checkout-branch')).toBeInTheDocument()
    expect(screen.getByTestId('board-card-unlink-branch')).toBeInTheDocument()
    expect(screen.queryByTestId('board-card-create-branch')).not.toBeInTheDocument()
  })

  it('calls onCheckoutBranch/onUnlinkBranch from their respective buttons', async () => {
    const onCheckoutBranch = vi.fn().mockResolvedValue(undefined)
    const onUnlinkBranch = vi.fn().mockResolvedValue(undefined)
    render(
      <BoardCardBranchSection
        linkedBranch="feature/header"
        onCreateBranch={vi.fn()}
        onCheckoutBranch={onCheckoutBranch}
        onUnlinkBranch={onUnlinkBranch}
      />
    )
    await userEvent.click(screen.getByTestId('board-card-checkout-branch'))
    expect(onCheckoutBranch).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByTestId('board-card-unlink-branch'))
    expect(onUnlinkBranch).toHaveBeenCalledTimes(1)
  })

  it('offers no Create PR button without a handler, even with a branch linked', () => {
    render(
      <BoardCardBranchSection
        linkedBranch="feature/header"
        onCreateBranch={vi.fn()}
        onCheckoutBranch={vi.fn()}
        onUnlinkBranch={vi.fn()}
      />
    )
    expect(screen.queryByTestId('board-card-create-pr')).not.toBeInTheDocument()
  })

  it('offers no Create PR button with no branch linked, even with a handler', () => {
    render(
      <BoardCardBranchSection
        onCreateBranch={vi.fn()}
        onCheckoutBranch={vi.fn()}
        onUnlinkBranch={vi.fn()}
        onCreatePr={vi.fn()}
      />
    )
    expect(screen.queryByTestId('board-card-create-pr')).not.toBeInTheDocument()
  })

  it('offers a Create PR button once a branch is linked, and fires its handler', async () => {
    const onCreatePr = vi.fn()
    render(
      <BoardCardBranchSection
        linkedBranch="feature/header"
        onCreateBranch={vi.fn()}
        onCheckoutBranch={vi.fn()}
        onUnlinkBranch={vi.fn()}
        onCreatePr={onCreatePr}
      />
    )
    await userEvent.click(screen.getByTestId('board-card-create-pr'))
    expect(onCreatePr).toHaveBeenCalledTimes(1)
  })

  it('hides the worktree section entirely with no branch linked', () => {
    render(
      <BoardCardBranchSection
        onCreateBranch={vi.fn()}
        onCheckoutBranch={vi.fn()}
        onUnlinkBranch={vi.fn()}
        onCreateWorktree={vi.fn()}
        onUnlinkWorktree={vi.fn()}
      />
    )
    expect(screen.queryByTestId('board-card-create-worktree')).not.toBeInTheDocument()
  })

  it('offers to create a worktree once a branch is linked', () => {
    render(
      <BoardCardBranchSection
        linkedBranch="feature/header"
        onCreateBranch={vi.fn()}
        onCheckoutBranch={vi.fn()}
        onUnlinkBranch={vi.fn()}
        onCreateWorktree={vi.fn()}
        onUnlinkWorktree={vi.fn()}
      />
    )
    expect(screen.getByText('No worktree linked')).toBeInTheDocument()
    expect(screen.getByTestId('board-card-create-worktree')).toBeInTheDocument()
    expect(screen.queryByTestId('board-card-unlink-worktree')).not.toBeInTheDocument()
  })

  it('calls onCreateWorktree when creating a worktree', async () => {
    const onCreateWorktree = vi.fn().mockResolvedValue(undefined)
    render(
      <BoardCardBranchSection
        linkedBranch="feature/header"
        onCreateBranch={vi.fn()}
        onCheckoutBranch={vi.fn()}
        onUnlinkBranch={vi.fn()}
        onCreateWorktree={onCreateWorktree}
        onUnlinkWorktree={vi.fn()}
      />
    )
    await userEvent.click(screen.getByTestId('board-card-create-worktree'))
    expect(onCreateWorktree).toHaveBeenCalledTimes(1)
  })

  // The state straight after this section's own "Create branch", which checks the branch out: git
  // refuses a second worktree on it, so the button that cannot work says why instead of firing.
  it('refuses to create a worktree for a branch another worktree already holds, and says where', async () => {
    const onCreateWorktree = vi.fn().mockResolvedValue(undefined)
    render(
      <BoardCardBranchSection
        linkedBranch="feature/header"
        onCreateBranch={vi.fn()}
        onCheckoutBranch={vi.fn()}
        onUnlinkBranch={vi.fn()}
        onCreateWorktree={onCreateWorktree}
        onUnlinkWorktree={vi.fn()}
        branchCheckedOutAt="/repos/app"
      />
    )
    const button = screen.getByTestId('board-card-create-worktree')
    const reason = screen.getByTestId('board-card-worktree-blocked')
    expect(button).toBeDisabled()
    expect(reason).toHaveTextContent('This branch is checked out at /repos/app.')
    // A disabled control a screen reader reaches with no reason attached is the same dead end.
    expect(button).toHaveAttribute('aria-describedby', reason.id)
    await userEvent.click(screen.getByTestId('board-card-create-worktree'))
    expect(onCreateWorktree).not.toHaveBeenCalled()
  })

  // The explanation belongs to the *missing* worktree. Once the card has one, where the branch is
  // checked out is no longer a reason for anything.
  it('drops the explanation once the card has a worktree of its own', () => {
    render(
      <BoardCardBranchSection
        linkedBranch="feature/header"
        onCreateBranch={vi.fn()}
        onCheckoutBranch={vi.fn()}
        onUnlinkBranch={vi.fn()}
        linkedWorktreePath="/repo.worktrees/feature/header"
        onCreateWorktree={vi.fn()}
        onUnlinkWorktree={vi.fn()}
        branchCheckedOutAt="/repo.worktrees/feature/header"
      />
    )
    expect(screen.queryByTestId('board-card-worktree-blocked')).not.toBeInTheDocument()
  })

  it('shows the linked worktree path with an unlink action instead of create', async () => {
    const onUnlinkWorktree = vi.fn().mockResolvedValue(undefined)
    render(
      <BoardCardBranchSection
        linkedBranch="feature/header"
        onCreateBranch={vi.fn()}
        onCheckoutBranch={vi.fn()}
        onUnlinkBranch={vi.fn()}
        linkedWorktreePath="/repo.worktrees/feature/header"
        onCreateWorktree={vi.fn()}
        onUnlinkWorktree={onUnlinkWorktree}
      />
    )
    expect(screen.getByText('/repo.worktrees/feature/header')).toBeInTheDocument()
    expect(screen.queryByTestId('board-card-create-worktree')).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId('board-card-unlink-worktree'))
    expect(onUnlinkWorktree).toHaveBeenCalledTimes(1)
  })
})
