import type { ComponentProps } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import type { BoardCard, BoardColumn } from '@git-manager/git-types'
import { makeCard } from '../../../test/boardFactories'
import { BoardColumnView } from './BoardColumnView'

const column: BoardColumn = { id: 'todo', name: 'To do', order: 0 }

function card(id: string, title: string): BoardCard {
  return makeCard({ id, title })
}

function renderColumn(props: Partial<ComponentProps<typeof BoardColumnView>> = {}) {
  const onToggleCollapsed = vi.fn()
  const onAddCard = vi.fn()
  const onCardClick = vi.fn()
  render(
    <DndContext>
      <BoardColumnView
        column={column}
        cards={[card('c1', 'First task'), card('c2', 'Second task')]}
        collapsed={false}
        onToggleCollapsed={onToggleCollapsed}
        onAddCard={onAddCard}
        onCardClick={onCardClick}
        addCardLabel="Add card"
        {...props}
      />
    </DndContext>
  )
  return { onToggleCollapsed, onAddCard, onCardClick }
}

describe('BoardColumnView', () => {
  it('shows the column name, card count, and every card', () => {
    renderColumn()
    expect(screen.getByText('To do')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('First task')).toBeInTheDocument()
    expect(screen.getByText('Second task')).toBeInTheDocument()
  })

  it('hides its cards when collapsed', () => {
    renderColumn({ collapsed: true })
    expect(screen.queryByText('First task')).not.toBeInTheDocument()
  })

  it('calls onToggleCollapsed when the chevron is clicked', () => {
    const { onToggleCollapsed } = renderColumn()
    fireEvent.click(screen.getByTestId('board-column-todo-toggle'))
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1)
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
