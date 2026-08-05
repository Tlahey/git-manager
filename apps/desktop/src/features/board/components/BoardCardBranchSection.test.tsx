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
})
