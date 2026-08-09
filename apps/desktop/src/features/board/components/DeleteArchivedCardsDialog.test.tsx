import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeleteArchivedCardsDialog } from './DeleteArchivedCardsDialog'

function renderDialog(count = 3, onConfirm = vi.fn().mockResolvedValue(count)) {
  const onOpenChange = vi.fn()
  render(
    <DeleteArchivedCardsDialog
      open
      onOpenChange={onOpenChange}
      count={count}
      onConfirm={onConfirm}
    />
  )
  return { onConfirm, onOpenChange }
}

describe('DeleteArchivedCardsDialog', () => {
  /** The count is the confirmation: there is no card title to recognise, only how much is at stake. */
  it('puts the number of cards at stake in the title and on the button', () => {
    renderDialog(12)
    expect(screen.getByText('Delete 12 archived cards?')).toBeInTheDocument()
    expect(screen.getByTestId('delete-archived-cards-confirm')).toHaveTextContent('Delete 12 cards')
  })

  it('reads in the singular for one card', () => {
    renderDialog(1)
    expect(screen.getByText('Delete 1 archived card?')).toBeInTheDocument()
    expect(screen.getByTestId('delete-archived-cards-confirm')).toHaveTextContent('Delete 1 card')
  })

  it('says the loss is permanent', () => {
    renderDialog(4)
    expect(screen.getByTestId('delete-archived-cards-dialog')).toHaveTextContent(
      /removed for good/
    )
  })

  it('purges and closes on confirm', async () => {
    const { onConfirm, onOpenChange } = renderDialog(2)

    await userEvent.click(screen.getByTestId('delete-archived-cards-confirm'))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('closes without purging on cancel', async () => {
    const { onConfirm, onOpenChange } = renderDialog(2)

    await userEvent.click(screen.getByText('Cancel'))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  /**
   * A purge of ninety cards is ninety writes on the remote backend, so the button is disabled while
   * it runs — a second click would start the same purge over a set the first is still removing.
   */
  it('refuses a second confirmation while the first is still running', async () => {
    let release = () => {}
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (release = resolve)))
    renderDialog(5, onConfirm as never)

    const confirm = screen.getByTestId('delete-archived-cards-confirm')
    await userEvent.click(confirm)
    await waitFor(() => expect(confirm).toBeDisabled())

    release()
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
  })

  /**
   * A failed purge leaves the dialog up: the archive is still full, and closing would say otherwise.
   * The rejection is expected — `reportWriteFailures` toasts and re-throws — so it must not escape
   * the click handler either, which is what the button coming back to life proves.
   */
  it('stays open and usable again when the purge fails', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('offline'))
    const { onOpenChange } = renderDialog(2, onConfirm)

    await userEvent.click(screen.getByTestId('delete-archived-cards-confirm'))

    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    await waitFor(() =>
      expect(screen.getByTestId('delete-archived-cards-confirm')).not.toBeDisabled()
    )
  })
})
