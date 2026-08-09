import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeBoard } from '../test/boardFactories'
import { MoveColumnDialog } from './MoveColumnDialog'

const sprint13 = makeBoard({
  id: 'b2',
  name: 'Sprint 13',
  columns: [
    { id: 'todo', name: 'To do', order: 0 },
    { id: 'done', name: 'Done', order: 1, isDone: true },
  ],
})
const backlog = makeBoard({
  id: 'b3',
  name: 'Backlog',
  columns: [{ id: 'ideas', name: 'Ideas', order: 0 }],
})

function renderDialog(props: Partial<React.ComponentProps<typeof MoveColumnDialog>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(3)
  render(
    <MoveColumnDialog
      open
      onOpenChange={() => {}}
      targets={[sprint13, backlog]}
      columnName="To do"
      columnId="todo"
      count={3}
      onSubmit={onSubmit}
      {...props}
    />
  )
  return onSubmit
}

describe('MoveColumnDialog', () => {
  it('names the column and how many cards would move', () => {
    renderDialog()
    expect(screen.getByText('Move everything out of "To do"')).toBeInTheDocument()
    expect(screen.getByTestId('move-column-dialog')).toHaveTextContent(
      /All 3 cards in "To do" move to the board you pick/
    )
    expect(screen.getByTestId('move-column-submit')).toHaveTextContent('Move 3 cards')
  })

  /** Column ids are what let "In progress" stay "In progress" across a sprint boundary. */
  it('defaults the destination to a column with the same id', () => {
    renderDialog()
    expect(screen.getByTestId('move-column-target-board')).toHaveValue('b2')
    expect(screen.getByTestId('move-column-target-column')).toHaveValue('todo')
  })

  it('falls back to the first column on a board that has no such id', async () => {
    renderDialog()

    await userEvent.selectOptions(screen.getByTestId('move-column-target-board'), 'b3')

    expect(screen.getByTestId('move-column-target-column')).toHaveValue('ideas')
  })

  it('submits the board and column picked', async () => {
    const onSubmit = renderDialog()

    await userEvent.selectOptions(screen.getByTestId('move-column-target-column'), 'done')
    await userEvent.click(screen.getByTestId('move-column-submit'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('b2', 'done'))
  })

  /** `columnMoveTargetsFor` can legitimately return nothing — one board, or all others closed. */
  it('says so when there is nowhere to move to, and cannot be submitted', () => {
    renderDialog({ targets: [] })
    expect(screen.getByTestId('move-column-no-targets')).toBeInTheDocument()
    expect(screen.getByTestId('move-column-submit')).toBeDisabled()
  })
})
