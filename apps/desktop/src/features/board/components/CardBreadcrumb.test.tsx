import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BoardCard } from '@git-manager/git-types'
import { makeCard } from '../test/boardFactories'
import { CardBreadcrumb } from './CardBreadcrumb'

function card(id: string, overrides: Partial<BoardCard> = {}): BoardCard {
  return makeCard({ id, boardId: 'b1', title: id, ...overrides })
}

function renderCrumb(props: Partial<React.ComponentProps<typeof CardBreadcrumb>> = {}) {
  const onAddLink = vi.fn().mockResolvedValue(undefined)
  const onOpenCard = vi.fn()
  render(
    <CardBreadcrumb
      card={card('c1', { prefix: 'GM', number: 7 })}
      boardName="Sprint 12"
      cards={[card('c1', { prefix: 'GM', number: 7 })]}
      onOpenCard={onOpenCard}
      onAddLink={onAddLink}
      {...props}
    />
  )
  return { onAddLink, onOpenCard }
}

describe('CardBreadcrumb', () => {
  it('reads board, then card, left to right', () => {
    renderCrumb()
    expect(screen.getByTestId('card-breadcrumb')).toHaveTextContent('Sprint 12')
    expect(screen.getByTestId('card-identifier')).toHaveTextContent('GM-7')
  })

  /** A card created without a prefix opted out of an identifier — showing `-0` would be worse than
   * showing nothing. */
  it('omits the identifier for a card that has none', () => {
    renderCrumb({ card: card('c1', { prefix: '', number: 0 }) })
    expect(screen.queryByTestId('card-identifier')).not.toBeInTheDocument()
  })
})

describe('CardBreadcrumb — the path always ends on the current card', () => {
  const issue = { owner: 'acme', repo: 'widgets', number: 42 }

  /**
   * A tracked card carries two numbers on purpose: where the work sits on this board, and what the
   * issue is called on GitHub. Neither stands in for the other.
   */
  it('shows the board identifier and the issue reference side by side', () => {
    renderCrumb({ card: card('c1', { prefix: 'GM', number: 8, sourceIssue: issue }) })
    expect(screen.getByTestId('card-identifier')).toHaveTextContent('GM-8')
    expect(screen.getByTestId('card-breadcrumb-issue')).toHaveTextContent('#42')
  })

  /** A card on a remote board *is* an issue — its number is the one GitHub allocated. */
  it('names a remote card by its issue number when it has no prefix', () => {
    renderCrumb({
      card: card('42', { prefix: '', number: 42 }),
      boardSource: 'remote',
      cards: [card('42', { prefix: '', number: 42 })],
    })
    expect(screen.getByTestId('card-breadcrumb-issue')).toHaveTextContent('#42')
    expect(screen.queryByTestId('card-breadcrumb-title')).not.toBeInTheDocument()
  })

  /** Ending the path at the parent would say you are somewhere you are not. */
  it('falls back to the title when the card has neither', () => {
    const plain = card('c1', { prefix: '', number: 0, title: 'Fix the header' })
    renderCrumb({ card: plain, cards: [plain] })
    expect(screen.getByTestId('card-breadcrumb-title')).toHaveTextContent('Fix the header')
  })

  it('needs no title once the card has an identifier', () => {
    renderCrumb()
    expect(screen.queryByTestId('card-breadcrumb-title')).not.toBeInTheDocument()
  })

  /** The kind is what the whole card is read against, and the sidebar that spells it out scrolls
   * away — so the path carries it, the way it already carries the parent's. */
  it('carries this card’s kind, not only the parent’s', () => {
    renderCrumb({ card: card('c1', { kind: 'bug', prefix: 'GM', number: 7 }) })
    expect(screen.getByTestId('card-kind-bug')).toHaveAttribute('aria-label', 'Bug')
  })

  it('carries it on a card with nothing but a title, too', () => {
    const plain = card('c1', { kind: 'epic', prefix: '', number: 0, title: 'Fix the header' })
    renderCrumb({ card: plain, cards: [plain] })
    expect(screen.getByTestId('card-kind-epic')).toBeInTheDocument()
  })
})

describe('CardBreadcrumb — the parent segment', () => {
  const child = card('c2', { prefix: 'GM', number: 8 })
  const epic = card('epic', {
    kind: 'epic',
    prefix: 'GM',
    number: 3,
    links: [{ targetBoardId: 'b1', targetCardId: 'c2', kind: 'contains' }],
  })

  /** Derived, never stored: the parent is the inverse of the `contains` the epic declared. */
  it('names the epic that contains the card', () => {
    renderCrumb({ card: child, cards: [epic, child] })
    expect(screen.getByTestId('card-breadcrumb-parent')).toHaveTextContent('GM-3')
  })

  it('opens the parent rather than merely naming it', async () => {
    const { onOpenCard } = renderCrumb({ card: child, cards: [epic, child] })
    await userEvent.click(screen.getByTestId('card-breadcrumb-parent'))
    expect(onOpenCard).toHaveBeenCalledWith('epic')
  })

  it('offers to add one when the card belongs to nothing', () => {
    renderCrumb()
    expect(screen.getByTestId('card-breadcrumb-add-parent')).toBeInTheDocument()
  })

  /**
   * The write lands on the **parent**, as `contains` — only forward halves are stored, so "is part
   * of" is not a half of its own.
   */
  it('writes the relation on the parent, not on this card', async () => {
    const { onAddLink } = renderCrumb({
      card: child,
      cards: [child, card('epic', { kind: 'epic' })],
    })

    await userEvent.click(screen.getByTestId('card-breadcrumb-add-parent'))
    await userEvent.click(screen.getByTestId('card-link-option-epic'))

    expect(onAddLink).toHaveBeenCalledWith(expect.objectContaining({ id: 'epic' }), 'partOf')
  })

  /** The button already answered "which relation" — offering five would ask it again. */
  it('picks a card without asking which relation it is', async () => {
    renderCrumb({ card: child, cards: [child, card('epic')] })
    await userEvent.click(screen.getByTestId('card-breadcrumb-add-parent'))
    expect(screen.queryByTestId('card-link-kind')).not.toBeInTheDocument()
  })

  /**
   * The breadcrumb is the dialog's first line: a picker rendered *inside* it pushed the title, the
   * description and every field below down the moment the button was pressed. Anchored in a popover,
   * it hangs over the layout instead of displacing it — which is what "not a descendant of the
   * breadcrumb" tests, the DOM place being the only thing jsdom can see of a portal.
   */
  it('hangs the picker over the card rather than inside the path', async () => {
    renderCrumb({ card: child, cards: [child, card('epic')] })
    await userEvent.click(screen.getByTestId('card-breadcrumb-add-parent'))

    const picker = screen.getByTestId('card-link-picker')
    expect(picker).toBeInTheDocument()
    expect(screen.getByTestId('card-breadcrumb')).not.toContainElement(picker)
  })

  /** The search field is what the picker invites you to type into — not whichever control the
   * popover would have focused on its own. */
  it('lands the caret in the search field', async () => {
    renderCrumb({ card: child, cards: [child, card('epic')] })
    await userEvent.click(screen.getByTestId('card-breadcrumb-add-parent'))

    expect(screen.getByTestId('card-link-search')).toHaveFocus()
  })

  it('offers nothing to add once the card has a parent', () => {
    renderCrumb({ card: child, cards: [epic, child] })
    expect(screen.queryByTestId('card-breadcrumb-add-parent')).not.toBeInTheDocument()
  })

  it('offers nothing to add on a closed sprint', () => {
    renderCrumb({ readOnly: true })
    expect(screen.queryByTestId('card-breadcrumb-add-parent')).not.toBeInTheDocument()
  })
})
