import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Board, BoardCard } from '@git-manager/git-types'
import { makeBoard, makeCard } from '../test/boardFactories'
import { CardLinksSection } from './CardLinksSection'

function card(id: string, overrides: Partial<BoardCard> = {}): BoardCard {
  return makeCard({ id, boardId: 'b1', title: id, ...overrides })
}

const BOARDS: Board[] = [makeBoard({ id: 'b1', name: 'Sprint 12' }), makeBoard({ id: 'b2', name: 'Backlog' })]

function renderSection(subject: BoardCard, cards: BoardCard[], readOnly = false) {
  const onOpenCard = vi.fn()
  const onAdd = vi.fn().mockResolvedValue(undefined)
  const onRemove = vi.fn().mockResolvedValue(undefined)
  render(
    <CardLinksSection
      card={subject}
      cards={cards}
      boards={BOARDS}
      onAdd={onAdd}
      onRemove={onRemove}
      onOpenCard={onOpenCard}
      readOnly={readOnly}
    />
  )
  return { onAdd, onRemove, onOpenCard }
}

describe('CardLinksSection', () => {
  it('says the card has no relations rather than showing an empty list', () => {
    renderSection(card('c1'), [card('c1')])
    expect(screen.getByTestId('card-links-empty')).toBeInTheDocument()
  })

  /** An epic listing its items is just the `contains` group. */
  it('lists what an epic contains', () => {
    const epic = card('epic', {
      kind: 'epic',
      links: [{ targetBoardId: 'b1', targetCardId: 'c2', kind: 'contains' }],
    })
    const child = card('c2', { title: 'Fix the header', prefix: 'GM', number: 7 })
    renderSection(epic, [epic, child])

    expect(screen.getByTestId('card-links-group-contains')).toBeInTheDocument()
    expect(screen.getByText('Fix the header')).toBeInTheDocument()
    expect(screen.getByText('GM-7')).toBeInTheDocument()
  })

  /** The same relation, read from the other end — and nothing is stored on this card for it. */
  it('shows the epic a card belongs to', () => {
    const epic = card('epic', {
      kind: 'epic',
      title: 'Redesign',
      links: [{ targetBoardId: 'b1', targetCardId: 'c2', kind: 'contains' }],
    })
    const child = card('c2')
    renderSection(child, [epic, child])

    expect(screen.getByTestId('card-links-group-partOf')).toBeInTheDocument()
    expect(screen.getByText('Redesign')).toBeInTheDocument()
  })

  /** A dangling link and a cross-board link must not read alike: saying "a card on Sprint 12" while
   * showing Sprint 12 is a lie, not a degradation. */
  it('says a link’s target is gone when it pointed at this very board', () => {
    const subject = card('c1', {
      links: [{ targetBoardId: 'b1', targetCardId: 'deleted', kind: 'blocks' }],
    })
    renderSection(subject, [subject])

    expect(screen.getByTestId('card-link-missing-deleted')).toHaveTextContent('no longer exists')
    expect(screen.queryByTestId('card-link-elsewhere-deleted')).not.toBeInTheDocument()
  })

  it('names the board for a relation whose other end is elsewhere', () => {
    const subject = card('c1', {
      links: [{ targetBoardId: 'b2', targetCardId: 'far', kind: 'relates' }],
    })
    renderSection(subject, [subject])

    expect(screen.getByTestId('card-link-elsewhere-far')).toHaveTextContent('A card on Backlog')
  })

  /** The "+" opens the line the relation is written on, in the list it is about to join. */
  it('drafts the new relation as a row of the section', async () => {
    const subject = card('c1')
    renderSection(subject, [subject, card('c2', { title: 'Ship the release' })])

    expect(screen.queryByTestId('card-link-draft')).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId('card-links-add'))

    const draft = screen.getByTestId('card-link-draft')
    expect(screen.getByTestId('card-links-section')).toContainElement(draft)
  })

  it('links a card through the draft row', async () => {
    const subject = card('c1')
    const other = card('c2', { title: 'Ship the release' })
    const { onAdd } = renderSection(subject, [subject, other])

    await userEvent.click(screen.getByTestId('card-links-add'))
    await userEvent.click(screen.getByTestId('card-link-kind'))
    await userEvent.click(screen.getByTestId('card-link-kind-blocks'))
    await userEvent.click(screen.getByTestId('card-link-option-c2'))
    await userEvent.click(screen.getByTestId('card-link-draft-add'))

    expect(onAdd).toHaveBeenCalledWith(other, 'blocks')
  })

  /** A card is not the relation: until the row is confirmed nothing has been written, so a mis-hit
   * in a list of similar titles is a keystroke to correct rather than an edit to undo. */
  it('writes nothing until the row is confirmed', async () => {
    const subject = card('c1')
    const { onAdd } = renderSection(subject, [subject, card('c2', { title: 'Ship the release' })])

    await userEvent.click(screen.getByTestId('card-links-add'))
    await userEvent.click(screen.getByTestId('card-link-option-c2'))

    expect(onAdd).not.toHaveBeenCalled()
  })

  it('cannot be confirmed before a card is chosen', async () => {
    const subject = card('c1')
    renderSection(subject, [subject, card('c2')])

    await userEvent.click(screen.getByTestId('card-links-add'))
    expect(screen.getByTestId('card-link-draft-add')).toBeDisabled()

    await userEvent.click(screen.getByTestId('card-link-option-c2'))
    expect(screen.getByTestId('card-link-draft-add')).toBeEnabled()
  })

  /** The text no longer names the card that was picked, so confirming would add a relation the row
   * has stopped showing. */
  it('unmakes the choice when the search is typed on', async () => {
    const subject = card('c1')
    renderSection(subject, [subject, card('c2', { title: 'Ship the release' })])

    await userEvent.click(screen.getByTestId('card-links-add'))
    await userEvent.click(screen.getByTestId('card-link-option-c2'))
    await userEvent.type(screen.getByTestId('card-link-search'), 'x')

    expect(screen.getByTestId('card-link-draft-add')).toBeDisabled()
  })

  it('narrows the candidates by title and by identifier', async () => {
    const subject = card('c1')
    const a = card('c2', { title: 'Ship the release', prefix: 'GM', number: 7 })
    const b = card('c3', { title: 'Unrelated' })
    renderSection(subject, [subject, a, b])

    await userEvent.click(screen.getByTestId('card-links-add'))
    await userEvent.type(screen.getByTestId('card-link-search'), 'GM-7')
    expect(screen.getByTestId('card-link-option-c2')).toBeInTheDocument()
    expect(screen.queryByTestId('card-link-option-c3')).not.toBeInTheDocument()
  })

  it('lands the caret in the search field, which is what the row invites', async () => {
    const subject = card('c1')
    renderSection(subject, [subject, card('c2')])

    await userEvent.click(screen.getByTestId('card-links-add'))

    expect(screen.getByTestId('card-link-search')).toHaveFocus()
  })

  /** The row lives among the children a folded section does not render, so a "+" that left it folded
   * would be a button visibly doing nothing. */
  it('unfolds the section when the draft is opened on a folded one', async () => {
    const subject = card('c1')
    renderSection(subject, [subject, card('c2')])

    await userEvent.click(screen.getByTestId('card-links-section-toggle'))
    expect(screen.queryByTestId('card-links-empty')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('card-links-add'))
    expect(screen.getByTestId('card-link-draft')).toBeInTheDocument()
  })

  it('never offers the card itself', async () => {
    const subject = card('c1')
    renderSection(subject, [subject])

    await userEvent.click(screen.getByTestId('card-links-add'))
    expect(screen.queryByTestId('card-link-option-c1')).not.toBeInTheDocument()
    expect(screen.getByTestId('card-link-empty')).toBeInTheDocument()
  })

  /** Removing an inverse relation hands back the link whose owner is the *other* card, which is
   * where the stored half lives. */
  it('removes a derived relation from the card that stores it', async () => {
    const blocker = card('c1', {
      links: [{ targetBoardId: 'b1', targetCardId: 'c2', kind: 'blocks' }],
    })
    const blocked = card('c2')
    const { onRemove } = renderSection(blocked, [blocker, blocked])

    await userEvent.click(screen.getByTestId('card-link-remove-c1'))
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ owner: blocker }))
  })

  it('offers neither linking nor unlinking on a closed sprint', () => {
    const subject = card('c1', {
      links: [{ targetBoardId: 'b1', targetCardId: 'c2', kind: 'relates' }],
    })
    renderSection(subject, [subject, card('c2')], true)

    expect(screen.queryByTestId('card-links-add')).not.toBeInTheDocument()
    expect(screen.queryByTestId('card-link-remove-c2')).not.toBeInTheDocument()
  })
})

/**
 * A relation reads as "this card, over there", and the useful gesture on it is going there — so the
 * row itself is the target, not the three characters of the identifier inside it.
 */
describe('CardLinksSection — walking to the card at the other end', () => {
  const related = { targetBoardId: 'b1', targetCardId: 'c2', kind: 'relates' as const }

  it('opens the related card from the row', async () => {
    const subject = card('c1', { links: [related] })
    const { onOpenCard } = renderSection(subject, [subject, card('c2', { title: 'Fix the header' })])

    await userEvent.click(screen.getByTestId('card-link-open-c2'))
    expect(onOpenCard).toHaveBeenCalledWith('c2')
  })

  /** Removing is its own control: the two sit in one row, and a click on the cross must not also
   * navigate away from the card it was removed from. */
  it('removes without opening', async () => {
    const subject = card('c1', { links: [related] })
    const { onOpenCard, onRemove } = renderSection(subject, [subject, card('c2')])

    await userEvent.click(screen.getByTestId('card-link-remove-c2'))
    expect(onRemove).toHaveBeenCalled()
    expect(onOpenCard).not.toHaveBeenCalled()
  })

  /** Nothing to open, so nothing that says it can be opened — the row stays plain text. */
  it('leaves a row whose other end is on another board unclickable', () => {
    const subject = card('c1', {
      links: [{ targetBoardId: 'b2', targetCardId: 'c9', kind: 'relates' }],
    })
    renderSection(subject, [subject])

    expect(screen.getByTestId('card-link-elsewhere-c9')).toBeInTheDocument()
    expect(screen.queryByTestId('card-link-open-c9')).not.toBeInTheDocument()
  })

  it('still names the card when the dialog offers no way to open one', () => {
    const subject = card('c1', { links: [related] })
    render(
      <CardLinksSection
        card={subject}
        cards={[subject, card('c2', { title: 'Fix the header' })]}
        boards={BOARDS}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    expect(screen.getByText('Fix the header')).toBeInTheDocument()
    expect(screen.queryByTestId('card-link-open-c2')).not.toBeInTheDocument()
  })
})

describe('CardLinksSection — closed sprint', () => {
  it('offers neither linking nor unlinking', () => {
    const subject = card('c1', {
      links: [{ targetBoardId: 'b1', targetCardId: 'c2', kind: 'relates' }],
    })
    renderSection(subject, [subject, card('c2')], true)

    expect(screen.queryByTestId('card-links-add')).not.toBeInTheDocument()
    expect(screen.queryByTestId('card-link-remove-c2')).not.toBeInTheDocument()
  })
})
