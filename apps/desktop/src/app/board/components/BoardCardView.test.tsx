import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import type { BoardCard, BoardTag } from '@git-manager/git-types'
import { makeCard as card } from '../../../test/boardFactories'
import { BoardCardView } from './BoardCardView'

const TAGS: BoardTag[] = [
  { id: 't-bug', name: 'bug', color: '#ff0000' },
  { id: 't-ui', name: 'ui', color: '#00ff00' },
  { id: 't-doc', name: 'doc', color: '#0000ff' },
]

function renderCard(c: BoardCard, onClick = vi.fn(), tags: BoardTag[] = TAGS) {
  render(
    <DndContext>
      <BoardCardView card={c} tags={tags} onClick={onClick} />
    </DndContext>
  )
  return onClick
}

describe('BoardCardView', () => {
  it('shows the title and, when present, the description and linked branch', () => {
    renderCard(card({ description: 'Needs a fresh coat of paint', linkedBranch: 'feature/header' }))
    expect(screen.getByText('Fix the header')).toBeInTheDocument()
    expect(screen.getByText('Needs a fresh coat of paint')).toBeInTheDocument()
    expect(screen.getByText('feature/header')).toBeInTheDocument()
  })

  it('omits the description and branch rows when absent', () => {
    renderCard(card())
    expect(screen.queryByText('feature/header')).not.toBeInTheDocument()
  })

  it('calls onClick when the card is clicked', () => {
    const onClick = renderCard(card())
    fireEvent.click(screen.getByTestId('board-card-c1'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('BoardCardView — metadata badges', () => {
  it('shows nothing extra for a plain card', () => {
    renderCard(card())
    expect(screen.queryByTestId('board-card-tag-stripe')).not.toBeInTheDocument()
    expect(screen.queryByTestId('board-card-dod')).not.toBeInTheDocument()
    expect(screen.queryByTestId('board-card-blocked')).not.toBeInTheDocument()
    expect(screen.queryByTestId('board-card-priority-normal')).not.toBeInTheDocument()
  })

  it('shows the priority as a glyph, labelled for anyone not reading the colour', () => {
    renderCard(card({ priority: 'high' }))
    expect(screen.getByTestId('card-priority-high')).toHaveAttribute('aria-label', 'High')
  })

  it('marks a low priority distinctly from a normal one', () => {
    renderCard(card({ priority: 'low' }))
    expect(screen.getByTestId('card-priority-low')).toHaveAttribute('aria-label', 'Low')
    expect(screen.queryByTestId('card-priority-normal')).not.toBeInTheDocument()
  })

  it('shows the assignee and the checklist progress', () => {
    renderCard(card({ assignee: 'ada', dod: '- [x] One\n- [ ] Two' }))
    expect(screen.getByTestId('board-card-assignee')).toHaveTextContent('ada')
    expect(screen.getByTestId('board-card-dod')).toHaveTextContent('1/2')
  })

  it('flags a past due date and leaves a future one plain', () => {
    renderCard(card({ dueDate: '2000-01-01' }))
    expect(screen.getByTestId('board-card-due-overdue')).toHaveTextContent('2000-01-01')

    screen.getByTestId('board-card-c1').remove()
    renderCard(card({ dueDate: '2999-01-01' }))
    expect(screen.getByTestId('board-card-due')).toBeInTheDocument()
  })

  it('warns when the card is blocked, and says why', () => {
    renderCard(card({ blockedReason: 'Waiting on the API' }))
    expect(screen.getByTestId('board-card-blocked')).toBeInTheDocument()
  })

  it('counts the comments', () => {
    renderCard(
      card({
        comments: [
          { id: 'k1', author: 'Ada', body: 'Hi', createdAt: '2026-08-01T00:00:00.000Z' },
          { id: 'k2', author: 'Bo', body: 'Yo', createdAt: '2026-08-02T00:00:00.000Z' },
        ],
      })
    )
    expect(screen.getByTestId('board-card-comments')).toHaveTextContent('2')
  })
})

describe('BoardCardView — tag stripe', () => {
  it('paints a single tag as a solid colour', () => {
    renderCard(card({ tagIds: ['t-bug'] }))
    expect(screen.getByTestId('board-card-tag-stripe')).toHaveStyle({ background: '#ff0000' })
  })

  it('splits several tags into bands', () => {
    renderCard(card({ tagIds: ['t-bug', 't-ui'] }))
    const stripe = screen.getByTestId('board-card-tag-stripe')
    expect(stripe.getAttribute('style')).toContain('linear-gradient')
  })

  it('lists every assigned tag as a chip, in board order', () => {
    renderCard(card({ tagIds: ['t-doc', 't-bug'] }))
    const chips = screen.getByTestId('board-card-tags').querySelectorAll('[data-testid^="board-card-tag-t-"]')
    expect([...chips].map((c) => c.textContent)).toEqual(['bug', 'doc'])
  })

  it('ignores a tag id the board no longer defines', () => {
    renderCard(card({ tagIds: ['t-bug', 't-deleted'] }))
    expect(screen.queryByTestId('board-card-tag-t-deleted')).not.toBeInTheDocument()
    expect(screen.getByTestId('board-card-tag-t-bug')).toBeInTheDocument()
  })
})

describe('BoardCardView — identifier', () => {
  /** The prefix is read off the card, not the board — that is what lets the identifier survive a
   * move to another board. */
  it('shows PREFIX-N from the card’s own prefix', () => {
    renderCard(card({ prefix: 'GM', number: 7 }))
    expect(screen.getByTestId('board-card-identifier')).toHaveTextContent('GM-7')
  })

  it('shows nothing for a card created without a prefix', () => {
    renderCard(card({ prefix: '', number: 7 }))
    expect(screen.queryByTestId('board-card-identifier')).not.toBeInTheDocument()
  })

  it('shows nothing for a card that predates the counter', () => {
    renderCard(card({ prefix: 'GM', number: 0 }))
    expect(screen.queryByTestId('board-card-identifier')).not.toBeInTheDocument()
  })
})
