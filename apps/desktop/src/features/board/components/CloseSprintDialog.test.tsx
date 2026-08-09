import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeBoard, makeCard } from '../test/boardFactories'
import { CloseSprintDialog } from './CloseSprintDialog'

const board = makeBoard({
  name: 'Sprint 12',
  columns: [
    { id: 'todo', name: 'To do', order: 0 },
    { id: 'done', name: 'Done', order: 1, isDone: true },
  ],
})

const cards = [
  makeCard({ id: 'a', columnId: 'done' }),
  makeCard({ id: 'b', columnId: 'todo' }),
  makeCard({ id: 'c', columnId: 'todo', blockedReason: 'Waiting on the API' }),
]

function renderDialog(props: Partial<React.ComponentProps<typeof CloseSprintDialog>> = {}) {
  const onConfirm = vi.fn().mockResolvedValue(undefined)
  render(
    <CloseSprintDialog
      open
      onOpenChange={() => {}}
      board={board}
      cards={cards}
      onConfirm={onConfirm}
      {...props}
    />
  )
  return onConfirm
}

describe('CloseSprintDialog', () => {
  it('reports what the sprint achieved', () => {
    renderDialog()
    expect(screen.getByTestId('sprint-completion')).toHaveTextContent('33%')
    expect(screen.getByTestId('sprint-by-column')).toHaveTextContent('To do')
  })

  it('proposes the next sprint’s name by bumping the number', () => {
    renderDialog()
    expect(screen.getByTestId('close-sprint-next-name')).toHaveValue('Sprint 13')
  })

  it('says how many cards will be carried over', () => {
    renderDialog()
    expect(screen.getByTestId('close-sprint-carry-hint')).toHaveTextContent('2 unfinished cards')
  })

  it('says the next sprint starts empty when everything is done', () => {
    renderDialog({ cards: [makeCard({ id: 'a', columnId: 'done' })] })
    expect(screen.getByTestId('close-sprint-carry-hint')).toHaveTextContent('Everything is done')
  })

  it('closes the sprint and carries the unfinished cards into a successor', async () => {
    const onConfirm = renderDialog()
    await userEvent.click(screen.getByTestId('close-sprint-confirm'))

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ totalCards: 3, doneCards: 1, unfinishedCards: 2, blockedCards: 1 }),
      { name: 'Sprint 13', carryOverCardIds: ['b', 'c'] },
      // The done column, pre-picked — see the archiving describe below.
      'done'
    )
  })

  it('closes without a successor when the carry-over is declined', async () => {
    const onConfirm = renderDialog()
    await userEvent.click(screen.getByTestId('close-sprint-carry-over'))
    await userEvent.click(screen.getByTestId('close-sprint-confirm'))

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ totalCards: 3 }), null, 'done')
  })

  it('will not create a successor with no name', async () => {
    renderDialog()
    await userEvent.clear(screen.getByTestId('close-sprint-next-name'))
    expect(screen.getByTestId('close-sprint-confirm')).toBeDisabled()
  })

  /**
   * The summary is computed here and handed over to be *stored*, because the carry-over that follows
   * takes the unfinished cards away — recomputing it later would flatter the sprint.
   */
  it('sends a summary describing the sprint as it stands, before anything moves', async () => {
    const onConfirm = renderDialog()
    await userEvent.click(screen.getByTestId('close-sprint-confirm'))

    const [summary] = onConfirm.mock.calls[0]
    expect(summary.totalCards).toBe(3)
    expect(summary.completionRate).toBe(33)
    expect(summary.closedAt).toEqual(expect.any(String))
  })
})

/**
 * Carry-over takes the unfinished work forward; this puts what stayed behind away, so a closed sprint
 * isn't left holding every ticket it ever completed. Which column counts as finished is the board's
 * own statement — the `isDone` flag — with the picker there for a board whose author never set it.
 */
describe('CloseSprintDialog — archiving the finished cards', () => {
  it('is offered pre-ticked, on the column the board flagged done', () => {
    renderDialog()
    expect(screen.getByTestId('close-sprint-archive-done')).toBeChecked()
    expect(screen.getByTestId('close-sprint-archive-column')).toHaveValue('done')
  })

  it('counts only what that column would actually give up', () => {
    renderDialog()
    // One card in `done`; the two in `todo` are the carry-over's business, not this one's.
    expect(screen.getByTestId('close-sprint-archive-hint')).toHaveTextContent(
      '1 card in the column'
    )

    // Naming another column re-counts against it.
    expect(screen.getByTestId('close-sprint-archive-hint')).not.toHaveTextContent('2 cards')
  })

  it('sends the chosen column through with the close', async () => {
    const onConfirm = renderDialog()

    await userEvent.selectOptions(screen.getByTestId('close-sprint-archive-column'), 'todo')
    await userEvent.click(screen.getByTestId('close-sprint-confirm'))

    expect(onConfirm).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'todo')
  })

  it('sends no column when the box is unticked, and hides the picker', async () => {
    const onConfirm = renderDialog()

    await userEvent.click(screen.getByTestId('close-sprint-archive-done'))
    expect(screen.queryByTestId('close-sprint-archive-column')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('close-sprint-confirm'))
    expect(onConfirm).toHaveBeenCalledWith(expect.anything(), expect.anything(), null)
  })

  /** No flag set: the rightmost column is the guess, and it is a visible one the user can change. */
  it('falls back to the last column when no column is flagged done', () => {
    renderDialog({
      board: makeBoard({
        name: 'Sprint 12',
        columns: [
          { id: 'todo', name: 'To do', order: 0 },
          { id: 'shipped', name: 'Shipped', order: 1 },
        ],
      }),
    })
    expect(screen.getByTestId('close-sprint-archive-column')).toHaveValue('shipped')
  })
})
