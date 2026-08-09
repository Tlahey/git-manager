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
 * A ticket belongs to a board and cannot be left without one, so there are exactly two answers:
 * destroy them, or archive them — which means keeping the board too, tombstoned, so they still have
 * one to name. The dialog spells out both consequences, because neither is obvious.
 */
describe('DeleteBoardDialog — what becomes of the tickets', () => {
  it('offers the choice, counted, and defaults to deleting them', async () => {
    const { onConfirm } = renderDialog({ cardCount: 7 })

    expect(screen.getByText('Delete its 7 tickets too')).toBeInTheDocument()
    expect(screen.getByTestId('delete-board-delete-cards')).toBeChecked()

    await userEvent.click(screen.getByTestId('delete-board-confirm'))
    expect(onConfirm).toHaveBeenCalledWith(true)
  })

  it('passes the choice through when unticked', async () => {
    const { onConfirm } = renderDialog()

    await userEvent.click(screen.getByTestId('delete-board-delete-cards'))
    await userEvent.click(screen.getByTestId('delete-board-confirm'))

    expect(onConfirm).toHaveBeenCalledWith(false)
  })

  /** Locally the erasure is total, and unticking keeps the board so the tickets still have one. */
  it('states both consequences on a local board', async () => {
    renderDialog({ source: 'local' })
    const hint = screen.getByTestId('delete-board-cards-hint')
    expect(hint).toHaveTextContent(/erased from this machine, backup included/)

    await userEvent.click(screen.getByTestId('delete-board-delete-cards'))
    expect(hint).toHaveTextContent(/archived and stay findable/)
    expect(hint).toHaveTextContent(/board is kept so they still have one/)
  })

  /** GitHub issues outlive the board either way, so the honest word is "closed", not "deleted". */
  it('states both consequences on a GitHub board', async () => {
    renderDialog({ source: 'remote' })
    const hint = screen.getByTestId('delete-board-cards-hint')
    expect(hint).toHaveTextContent(/closed on GitHub/)
    expect(hint).toHaveTextContent(/no way to delete an issue/)

    await userEvent.click(screen.getByTestId('delete-board-delete-cards'))
    expect(hint).toHaveTextContent(/stay open and gain the "archived" label/)
  })

  /** Nothing is promised as recoverable — an earlier version said so, and no screen restores it. */
  it('never claims the board can be recovered', () => {
    renderDialog({ source: 'local' })
    expect(screen.getByTestId('delete-board-dialog')).not.toHaveTextContent(/recoverable/i)
  })

  /** Nothing to decide about: an empty board's deletion is only about the board. */
  it('asks nothing when the board has no cards', () => {
    renderDialog({ cardCount: 0 })
    expect(screen.queryByTestId('delete-board-delete-cards')).not.toBeInTheDocument()
  })
})
