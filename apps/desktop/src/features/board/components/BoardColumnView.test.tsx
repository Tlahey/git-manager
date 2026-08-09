import type { ComponentProps } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import type { BoardCard, BoardColumn } from '@git-manager/git-types'
import { makeCard } from '../test/boardFactories'
import { BoardColumnView } from './BoardColumnView'

const column: BoardColumn = { id: 'todo', name: 'To do', order: 0 }

function card(id: string, title: string): BoardCard {
  return makeCard({ id, title })
}

function renderColumn(props: Partial<ComponentProps<typeof BoardColumnView>> = {}) {
  const onAddCard = vi.fn()
  const onCardClick = vi.fn()
  render(
    <DndContext>
      <BoardColumnView
        column={column}
        cards={[card('c1', 'First task'), card('c2', 'Second task')]}
        onAddCard={onAddCard}
        onCardClick={onCardClick}
        addCardLabel="Add card"
        {...props}
      />
    </DndContext>
  )
  return { onAddCard, onCardClick }
}

describe('BoardColumnView', () => {
  it('shows the column name, card count, and every card', () => {
    renderColumn()
    expect(screen.getByText('To do')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('First task')).toBeInTheDocument()
    expect(screen.getByText('Second task')).toBeInTheDocument()
  })

  /** The count is a fact about the column, not a notification — an outlined badge rather than the
   * accent pill `NumberBadge` draws, and it stays on screen when there is nothing to count. */
  it('counts an empty column as zero rather than hiding the count', () => {
    renderColumn({ cards: [] })
    expect(screen.getByTestId('board-column-todo-count')).toHaveTextContent('0')
  })

  /** Which column means "finished" drives the sprint report, so the board says it rather than
   * leaving it to whoever named the column. */
  it('marks the column that counts as done', () => {
    renderColumn({ column: { ...column, isDone: true } })
    expect(screen.getByTestId('board-column-todo-done')).toBeInTheDocument()
  })

  it('leaves every other column unmarked', () => {
    renderColumn()
    expect(screen.queryByTestId('board-column-todo-done')).not.toBeInTheDocument()
  })

  /** A column is always open. Folding one used to hide its cards without narrowing the 340px track,
   * so it freed no room on a horizontal board and made the column undroppable while folded. */
  it('offers no way to fold the column away', () => {
    renderColumn()
    expect(screen.queryByTestId('board-column-todo-toggle')).not.toBeInTheDocument()
    expect(screen.getByText('First task')).toBeInTheDocument()
  })

  it('calls onAddCard when the add button is clicked', () => {
    const { onAddCard } = renderColumn()
    fireEvent.click(screen.getByTestId('board-column-todo-add-card'))
    expect(onAddCard).toHaveBeenCalledTimes(1)
  })

  it('calls onCardClick with the clicked card', () => {
    const { onCardClick } = renderColumn()
    fireEvent.click(screen.getByTestId('board-card-c2'))
    expect(onCardClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'c2' }))
  })
})

/**
 * A drag needs to say where the card would land. An empty column is the case that matters most:
 * with nothing to hover over, no feedback is indistinguishable from "you can't drop here".
 */
describe('BoardColumnView — drop target', () => {
  it('draws a placeholder for an empty column', () => {
    renderColumn({ cards: [] })
    expect(screen.getByTestId('board-column-todo-empty')).toHaveTextContent('No cards')
  })

  it('draws no placeholder once the column has cards', () => {
    renderColumn()
    expect(screen.queryByTestId('board-column-todo-empty')).not.toBeInTheDocument()
  })

  it('is not marked as a drop target while nothing is being dragged over it', () => {
    renderColumn({ cards: [] })
    expect(screen.getByTestId('board-column-todo')).not.toHaveAttribute('data-droppable-over')
  })
})
