import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BoardSource } from '@git-manager/git-types'
import { DeleteBoardDialog } from './DeleteBoardDialog'

function renderDialog({
  source = 'local' as BoardSource,
  cardCount = 3,
  onConfirm = vi.fn().mockResolvedValue(undefined),
  onOpenChange = vi.fn(),
} = {}) {
  render(
    <DeleteBoardDialog
      open
      onOpenChange={onOpenChange}
      boardName="Sprint 12"
      source={source}
      cardCount={cardCount}
      onConfirm={onConfirm}
    />
  )
  return { onConfirm, onOpenChange }
}

describe('DeleteBoardDialog', () => {
  it('shows the board name in the title', () => {
    renderDialog()
    expect(screen.getByText('Delete "Sprint 12"?')).toBeInTheDocument()
  })

  it('calls onConfirm and closes when confirmed', async () => {
    const { onConfirm, onOpenChange } = renderDialog()

    await userEvent.click(screen.getByTestId('delete-board-confirm'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('does not call onConfirm when cancelled', async () => {
    const { onConfirm } = renderDialog()
    await userEvent.click(screen.getByText('Cancel'))
    expect(onConfirm).not.toHaveBeenCalled()
  })
})

/**
 * The board goes either way; its tickets are the separate question. What "keep them" means depends on
 * where they live, so the dialog says which rather than offering one sentence that is only true of
 * one backend.
 */
describe('DeleteBoardDialog — what becomes of the tickets', () => {
  it('offers to delete them too, counted, and defaults to yes', async () => {
    const { onConfirm } = renderDialog({ cardCount: 7 })

    const box = screen.getByTestId('delete-board-delete-cards')
    expect(screen.getByText('Delete its 7 tickets too')).toBeInTheDocument()
    expect(box).toBeChecked()

    await userEvent.click(screen.getByTestId('delete-board-confirm'))
    expect(onConfirm).toHaveBeenCalledWith(true)
  })

  it('passes the choice through when unticked', async () => {
    const { onConfirm } = renderDialog()

    await userEvent.click(screen.getByTestId('delete-board-delete-cards'))
    await userEvent.click(screen.getByTestId('delete-board-confirm'))

    expect(onConfirm).toHaveBeenCalledWith(false)
  })

  /** A local board's cards live in its ref; the backup is the only thing that can outlast it. */
  it('explains the local consequence, and that keeping them means recoverable', async () => {
    renderDialog({ source: 'local' })
    const hint = screen.getByTestId('delete-board-cards-hint')
    expect(hint).toHaveTextContent(/erased from this machine, backup included/)

    await userEvent.click(screen.getByTestId('delete-board-delete-cards'))
    expect(hint).toHaveTextContent(/stays under recoverable boards/)
  })

  /** GitHub issues outlive the board either way, so the honest word is "closed", not "deleted". */
  it('explains the GitHub consequence in terms of closing issues', async () => {
    renderDialog({ source: 'remote' })
    const hint = screen.getByTestId('delete-board-cards-hint')
    expect(hint).toHaveTextContent(/closed on GitHub/)
    expect(hint).toHaveTextContent(/no way to delete an issue/)

    await userEvent.click(screen.getByTestId('delete-board-delete-cards'))
    expect(hint).toHaveTextContent(/stay open on GitHub/)
  })

  /** Nothing to decide about: an empty board's deletion is only about the board. */
  it('asks nothing when the board has no cards', () => {
    renderDialog({ cardCount: 0 })
    expect(screen.queryByTestId('delete-board-delete-cards')).not.toBeInTheDocument()
  })
})
