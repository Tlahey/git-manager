import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeleteBoardDialog } from './DeleteBoardDialog'

describe('DeleteBoardDialog', () => {
  it('shows the board name in the title', () => {
    render(
      <DeleteBoardDialog open onOpenChange={() => {}} boardName="Sprint 12" onConfirm={vi.fn()} />
    )
    expect(screen.getByText('Delete "Sprint 12"?')).toBeInTheDocument()
  })

  it('calls onConfirm and closes when confirmed', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const onOpenChange = vi.fn()
    render(
      <DeleteBoardDialog
        open
        onOpenChange={onOpenChange}
        boardName="Sprint 12"
        onConfirm={onConfirm}
      />
    )

    await userEvent.click(screen.getByTestId('delete-board-confirm'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('does not call onConfirm when cancelled', async () => {
    const onConfirm = vi.fn()
    render(
      <DeleteBoardDialog open onOpenChange={() => {}} boardName="Sprint 12" onConfirm={onConfirm} />
    )
    await userEvent.click(screen.getByText('Cancel'))
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
