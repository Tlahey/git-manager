import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import type { BoardCard, BoardTag } from '@git-manager/git-types'
import { makeCard as card } from '../test/boardFactories'
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
  it('shows the title and, when present, the description', () => {
    renderCard(card({ description: 'Needs a fresh coat of paint' }))
    expect(screen.getByText('Fix the header')).toBeInTheDocument()
    expect(screen.getByText('Needs a fresh coat of paint')).toBeInTheDocument()
  })

  it('omits the description row when absent', () => {
    renderCard(card())
    expect(screen.queryByText('Needs a fresh coat of paint')).not.toBeInTheDocument()
  })

  /** The card face is a summary, not the record. The linked branch and the comment count belong to
   * the card's own dialog, where there is room to act on them. */
  it('leaves the linked branch and the comment count to the dialog', () => {
    renderCard(
      card({
        linkedBranch: 'feature/header',
        comments: [{ id: 'k1', author: 'Ada', body: 'Hi', createdAt: '2026-08-01T00:00:00.000Z' }],
      })
    )
    expect(screen.queryByText('feature/header')).not.toBeInTheDocument()
    expect(screen.queryByTestId('board-card-comments')).not.toBeInTheDocument()
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
    expect(screen.queryByTestId('board-card-tags')).not.toBeInTheDocument()
    expect(screen.queryByTestId('board-card-dod')).not.toBeInTheDocument()
    expect(screen.queryByTestId('board-card-blocked')).not.toBeInTheDocument()
    expect(screen.queryByTestId('board-card-assignee')).not.toBeInTheDocument()
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

  /** The assignee is a face, not a name: at this size the name crowded out everything beside it,
   * and a picture is what the eye picks a card out of a column by. */
  it('shows the assignee as an avatar, named for a screen reader', () => {
    renderCard(card({ assignee: 'ada' }))
    const assignee = screen.getByTestId('board-card-assignee')
    expect(assignee).toHaveTextContent('AD')
    expect(within(assignee).getByTitle('ada')).toBeInTheDocument()
  })

  it('shows the assignee’s picture when the name is a known GitHub login', () => {
    render(
      <DndContext>
        <BoardCardView
          card={card({ assignee: 'ada' })}
          tags={TAGS}
          onClick={vi.fn()}
          avatarUrlFor={(name) => (name === 'ada' ? 'https://example.test/ada.png' : undefined)}
        />
      </DndContext>
    )
    expect(within(screen.getByTestId('board-card-assignee')).getByRole('img')).toHaveAttribute(
      'src',
      'https://example.test/ada.png'
    )
  })

  it('shows the checklist progress', () => {
    renderCard(card({ dod: '- [x] One\n- [ ] Two' }))
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

})

describe('BoardCardView — tag badges', () => {
  /** Filled rather than tinted, so the badge is recognisable before the title is read — which is
   * also why the stripe down the left edge went: it said the same thing without naming it. */
  it('fills each badge with the tag’s own colour, and drops the edge stripe', () => {
    renderCard(card({ tagIds: ['t-bug'] }))
    expect(screen.queryByTestId('board-card-tag-stripe')).not.toBeInTheDocument()
    expect(screen.getByTestId('board-card-tag-t-bug')).toHaveStyle({ backgroundColor: '#ff0000' })
  })

  /** A user-picked colour can be anything, so the ink is measured against the fill rather than
   * fixed — a pale tag with white text would be a badge nobody can read. */
  it('inks a badge for legibility on its own fill', () => {
    render(
      <DndContext>
        <BoardCardView
          card={card({ tagIds: ['t-pale'] })}
          tags={[{ id: 't-pale', name: 'pale', color: '#ffee00' }]}
          onClick={vi.fn()}
        />
      </DndContext>
    )
    expect(screen.getByTestId('board-card-tag-t-pale')).toHaveStyle({ color: '#171717' })
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

  /**
   * The title is what a card is *scanned* for; the key is what it is *quoted* by, which happens
   * once you have already found it — so the identifier sits in the footer, beside the kind glyph,
   * rather than ahead of the title.
   */
  it('puts the identifier in the footer, next to the kind glyph', () => {
    renderCard(card({ prefix: 'GM', number: 7, title: 'Fix the header' }))
    const footer = screen.getByTestId('board-card-identifier').parentElement
    expect(footer).toHaveTextContent('GM-7')
    expect(within(footer as HTMLElement).getByTestId('card-kind-task')).toBeInTheDocument()
    expect(footer).not.toHaveTextContent('Fix the header')
  })
})

describe('BoardCardView — kind', () => {
  it('marks a bug with its own labelled glyph', () => {
    renderCard(card({ kind: 'bug' }))
    expect(screen.getByTestId('card-kind-bug')).toHaveAttribute('aria-label', 'Bug')
  })

  it('marks an epic distinctly from a task', () => {
    renderCard(card({ kind: 'epic' }))
    expect(screen.getByTestId('card-kind-epic')).toBeInTheDocument()
    expect(screen.queryByTestId('card-kind-task')).not.toBeInTheDocument()
  })

  /** Unlike a `normal` priority, an ordinary task still shows its glyph: the three kinds are peers,
   * and a card with no icon would read as one whose kind failed to load rather than as a task. */
  it('still marks a plain task', () => {
    renderCard(card())
    expect(screen.getByTestId('card-kind-task')).toBeInTheDocument()
  })
})
