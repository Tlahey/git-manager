import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArchiveColumnDialog } from './ArchiveColumnDialog'

function renderDialog({
  count = 4,
  onConfirm = vi.fn().mockResolvedValue(count),
  onOpenChange = vi.fn(),
} = {}) {
  render(
    <ArchiveColumnDialog
      open
      onOpenChange={onOpenChange}
      columnName="Done"
      count={count}
      onConfirm={onConfirm}
    />
  )
  return { onConfirm, onOpenChange }
}

describe('ArchiveColumnDialog', () => {
  /** A column header stands for its cards without naming any, so "how many" is what a reader needs. */
  it('names the column and how many cards it would take', () => {
    renderDialog({ count: 4 })
    expect(screen.getByText('Archive everything in "Done"?')).toBeInTheDocument()
    expect(screen.getByTestId('archive-column-dialog')).toHaveTextContent(
      /All 4 cards in "Done" leave the board/
    )
    expect(screen.getByTestId('archive-column-confirm')).toHaveTextContent('Archive 4 cards')
  })

  it('reads in the singular for one card', () => {
    renderDialog({ count: 1 })
    expect(screen.getByTestId('archive-column-confirm')).toHaveTextContent('Archive 1 card')
  })

  /** Nothing is lost here — the copy has to say so, or this reads like the purge. */
  it('says the cards are restorable rather than destroyed', () => {
    renderDialog()
    expect(screen.getByTestId('archive-column-dialog')).toHaveTextContent(
      /restore them at any time/
    )
  })

  it('archives and closes on confirm', async () => {
    const { onConfirm, onOpenChange } = renderDialog()

    await userEvent.click(screen.getByTestId('archive-column-confirm'))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('closes without archiving on cancel', async () => {
    const { onConfirm, onOpenChange } = renderDialog()

    await userEvent.click(screen.getByText('Cancel'))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('stays open and usable again when the write fails', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('offline'))
    const { onOpenChange } = renderDialog({ onConfirm })

    await userEvent.click(screen.getByTestId('archive-column-confirm'))

    await waitFor(() => expect(onConfirm).toHaveBeenCalled())
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    await waitFor(() => expect(screen.getByTestId('archive-column-confirm')).not.toBeDisabled())
  })
})
