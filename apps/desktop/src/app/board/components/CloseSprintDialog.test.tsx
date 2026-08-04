import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeBoard, makeCard } from '../../../test/boardFactories'
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
      { name: 'Sprint 13', carryOverCardIds: ['b', 'c'] }
    )
  })

  it('closes without a successor when the carry-over is declined', async () => {
    const onConfirm = renderDialog()
    await userEvent.click(screen.getByTestId('close-sprint-carry-over'))
    await userEvent.click(screen.getByTestId('close-sprint-confirm'))

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ totalCards: 3 }), null)
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
