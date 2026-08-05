import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BoardColumn } from '@git-manager/git-types'

import { CardStatusPicker } from './CardStatusPicker'

const COLUMNS: BoardColumn[] = [
  { id: 'doing', name: 'In progress', order: 1 },
  { id: 'todo', name: 'To do', order: 0 },
  { id: 'done', name: 'Done', order: 2, isDone: true },
]

function renderPicker(columnId = 'todo', readOnly = false) {
  const onChange = vi.fn().mockResolvedValue(undefined)
  render(
    <CardStatusPicker
      columns={COLUMNS}
      columnId={columnId}
      onChange={onChange}
      readOnly={readOnly}
    />
  )
  return onChange
}

describe('CardStatusPicker', () => {
  it('shows the column the card is in', () => {
    renderPicker('doing')
    expect(screen.getByTestId('card-status-picker')).toHaveTextContent('In progress')
  })

  it('lists the columns in the board’s own order, not the array’s', async () => {
    renderPicker()
    await userEvent.click(screen.getByTestId('card-status-picker'))

    const labels = screen
      .getAllByRole('menuitem')
      .map((item) => item.textContent?.replace(/\s+/g, ' ').trim())
    expect(labels).toEqual(['To do', 'In progress', 'Done'])
  })

  /** The one gesture this exists for: moving the card without closing it, finding it on the board
   * and dragging it. */
  it('moves the card to the picked column', async () => {
    const onChange = renderPicker()
    await userEvent.click(screen.getByTestId('card-status-picker'))
    await userEvent.click(screen.getByTestId('card-status-option-done'))
    expect(onChange).toHaveBeenCalledWith('done')
  })

  /** The list is also a read-out: a tick marks where the card is now, so picking is a choice made
   * against the current state rather than blind. */
  it('ticks the current column, and only it', async () => {
    renderPicker('doing')
    await userEvent.click(screen.getByTestId('card-status-picker'))

    expect(screen.getByTestId('card-status-option-doing').querySelector('svg')).toBeTruthy()
    expect(screen.getByTestId('card-status-option-todo').querySelector('svg')).toBeNull()
  })

  /** A column deleted from the board while a card still points at it: the card says so instead of
   * rendering a blank button. */
  it('names an unknown column rather than showing nothing', () => {
    renderPicker('gone')
    expect(screen.getByTestId('card-status-picker')).toHaveTextContent('No column')
  })

  it('reads as a plain label on a closed sprint, with nothing to open', () => {
    renderPicker('todo', true)
    expect(screen.getByTestId('card-status-readonly')).toHaveTextContent('To do')
    expect(screen.queryByTestId('card-status-picker')).not.toBeInTheDocument()
  })
})
