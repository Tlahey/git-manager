import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ColumnActionsMenu } from './ColumnActionsMenu'

function renderMenu(props: Partial<React.ComponentProps<typeof ColumnActionsMenu>> = {}) {
  const handlers = { onArchiveAll: vi.fn(), onMoveAll: vi.fn() }
  render(<ColumnActionsMenu {...handlers} cardCount={4} testId="column-menu" {...props} />)
  return handlers
}

describe('ColumnActionsMenu', () => {
  it('offers both column-wide actions, counted', async () => {
    renderMenu()

    await userEvent.click(screen.getByTestId('column-menu'))

    expect(screen.getByTestId('column-action-archive-all')).toHaveTextContent(
      'Archive all 4 cards in this column'
    )
    expect(screen.getByTestId('column-action-move-all')).toHaveTextContent(
      'Move all 4 cards to another board'
    )
  })

  it('reads in the singular for a column holding one card', async () => {
    renderMenu({ cardCount: 1 })

    await userEvent.click(screen.getByTestId('column-menu'))

    expect(screen.getByTestId('column-action-archive-all')).toHaveTextContent(
      'Archive the card in this column'
    )
  })

  it('delegates rather than acting', async () => {
    const { onArchiveAll } = renderMenu()

    await userEvent.click(screen.getByTestId('column-menu'))
    await userEvent.click(screen.getByTestId('column-action-archive-all'))

    expect(onArchiveAll).toHaveBeenCalledTimes(1)
  })

  /** Nothing to act on: a trigger here opens a menu about no cards. */
  it('is absent over an empty column', () => {
    renderMenu({ cardCount: 0 })
    expect(screen.queryByTestId('column-menu')).not.toBeInTheDocument()
  })

  /** A closed sprint: the caller withholds every handler, and the trigger goes with them. */
  it('is absent when no action applies', () => {
    render(<ColumnActionsMenu cardCount={4} testId="column-menu" />)
    expect(screen.queryByTestId('column-menu')).not.toBeInTheDocument()
  })

  /** Moving needs somewhere to move to; archiving never does. */
  it('drops just the move entry when there is no target board', async () => {
    renderMenu({ onMoveAll: undefined })

    await userEvent.click(screen.getByTestId('column-menu'))

    expect(screen.getByTestId('column-action-archive-all')).toBeInTheDocument()
    expect(screen.queryByTestId('column-action-move-all')).not.toBeInTheDocument()
  })
})
