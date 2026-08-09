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
 * What becomes of the tickets is asked only where it is a question. On a GitHub board it is one — an
 * issue outlives the board either way. On a local board it is not: the cards are inside the ref and
 * go with it, so the dialog states the loss rather than offering a choice it cannot honour.
 */
describe('DeleteBoardDialog — a GitHub board asks about its issues', () => {
  it('offers to close them too, counted, and defaults to yes', async () => {
    const { onConfirm } = renderDialog({ source: 'remote', cardCount: 7 })

    expect(screen.getByText('Delete its 7 tickets too')).toBeInTheDocument()
    expect(screen.getByTestId('delete-board-delete-cards')).toBeChecked()

    await userEvent.click(screen.getByTestId('delete-board-confirm'))
    expect(onConfirm).toHaveBeenCalledWith(true)
  })

  it('passes the choice through when unticked', async () => {
    const { onConfirm } = renderDialog({ source: 'remote' })

    await userEvent.click(screen.getByTestId('delete-board-delete-cards'))
    await userEvent.click(screen.getByTestId('delete-board-confirm'))

    expect(onConfirm).toHaveBeenCalledWith(false)
  })

  /** The issues outlive the board either way, so the honest word is "closed", not "deleted". */
  it('says closing, not deleting, and what unticking leaves behind', async () => {
    renderDialog({ source: 'remote' })
    const hint = screen.getByTestId('delete-board-cards-hint')
    expect(hint).toHaveTextContent(/closed on GitHub/)
    expect(hint).toHaveTextContent(/no way to delete an issue/)

    await userEvent.click(screen.getByTestId('delete-board-delete-cards'))
    expect(hint).toHaveTextContent(/stay open on GitHub/)
  })

  /** Nothing to decide about: an empty board's deletion is only about the board. */
  it('asks nothing when the board has no cards', () => {
    renderDialog({ source: 'remote', cardCount: 0 })
    expect(screen.queryByTestId('delete-board-delete-cards')).not.toBeInTheDocument()
  })
})

/**
 * A local board's cards cannot outlive it, so offering to keep them would be a promise the app
 * cannot keep — which is exactly what the earlier "recoverable" wording did.
 */
describe('DeleteBoardDialog — a local board states the loss', () => {
  it('warns that the tickets go, counted, and names the way to avoid it', () => {
    renderDialog({ source: 'local', cardCount: 7 })

    const warning = screen.getByTestId('delete-board-cards-lost')
    expect(warning).toHaveTextContent('Its 7 tickets go with it, for good')
    expect(warning).toHaveTextContent(/Archive or move the ones worth keeping/)
  })

  it('offers no choice it could not honour', () => {
    renderDialog({ source: 'local' })
    expect(screen.queryByTestId('delete-board-delete-cards')).not.toBeInTheDocument()
  })

  /** Nothing is promised as recoverable — the earlier copy said it was, and no screen restores it. */
  it('never claims the board can be recovered', () => {
    renderDialog({ source: 'local' })
    expect(screen.getByTestId('delete-board-dialog')).not.toHaveTextContent(/recoverable/i)
  })

  it('confirms with the tickets going, since that is the only outcome', async () => {
    const { onConfirm } = renderDialog({ source: 'local' })

    await userEvent.click(screen.getByTestId('delete-board-confirm'))

    expect(onConfirm).toHaveBeenCalledWith(true)
  })

  it('says nothing about tickets on an empty board', () => {
    renderDialog({ source: 'local', cardCount: 0 })
    expect(screen.queryByTestId('delete-board-cards-lost')).not.toBeInTheDocument()
  })
})
