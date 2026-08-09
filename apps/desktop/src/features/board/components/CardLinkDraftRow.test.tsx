import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BoardCard } from '@git-manager/git-types'
import { makeCard } from '../test/boardFactories'
import { CardLinkDraftRow } from './CardLinkDraftRow'

function card(id: string, overrides: Partial<BoardCard> = {}): BoardCard {
  return makeCard({ id, boardId: 'b1', title: id, ...overrides })
}

function renderRow(candidates: BoardCard[] = [card('c2', { title: 'Ship the release' })]) {
  const onAdd = vi.fn().mockResolvedValue(undefined)
  const onCancel = vi.fn()
  render(<CardLinkDraftRow candidates={candidates} onAdd={onAdd} onCancel={onCancel} />)
  return { onAdd, onCancel }
}

describe('CardLinkDraftRow', () => {
  it('reads as one line: the relation, the card, and the button that writes it', () => {
    renderRow()
    expect(screen.getByTestId('card-link-kind')).toBeInTheDocument()
    expect(screen.getByTestId('card-link-search')).toBeInTheDocument()
    expect(screen.getByTestId('card-link-draft-add')).toBeInTheDocument()
  })

  /** The row opens on the loosest relation: it is the one that asserts least about two cards. */
  it('starts on “relates to”', () => {
    renderRow()
    expect(screen.getByTestId('card-link-kind')).toHaveTextContent('Relates to')
  })

  it('offers the inverse readings too, so neither card has to be opened to state the obvious', async () => {
    renderRow()
    await userEvent.click(screen.getByTestId('card-link-kind'))

    expect(screen.getByTestId('card-link-kind-blockedBy')).toHaveTextContent('Is blocked by')
    expect(screen.getByTestId('card-link-kind-partOf')).toHaveTextContent('Is part of')
  })

  it('writes the chosen relation once the row is confirmed', async () => {
    const target = card('c2', { title: 'Ship the release' })
    const { onAdd, onCancel } = renderRow([target])

    await userEvent.click(screen.getByTestId('card-link-option-c2'))
    await userEvent.click(screen.getByTestId('card-link-draft-add'))

    expect(onAdd).toHaveBeenCalledWith(target, 'relates')
    // The line has become a real row of the list; the draft has nothing left to show.
    expect(onCancel).toHaveBeenCalled()
  })

  /** The row is a sentence being typed, and Enter is how a typed line is finished. */
  it('confirms on Enter as well as on the button', async () => {
    const { onAdd } = renderRow()

    await userEvent.click(screen.getByTestId('card-link-option-c2'))
    await userEvent.type(screen.getByTestId('card-link-search'), '{Enter}')

    expect(onAdd).toHaveBeenCalled()
  })

  it('does nothing on Enter while no card has been chosen', async () => {
    const { onAdd } = renderRow()

    await userEvent.type(screen.getByTestId('card-link-search'), 'ship{Enter}')

    expect(onAdd).not.toHaveBeenCalled()
  })

  it('writes the chosen card into the field, by the name the board knows it under', async () => {
    renderRow([card('c2', { prefix: 'GM', number: 7, title: 'Ship the release' })])

    await userEvent.click(screen.getByTestId('card-link-option-c2'))

    expect(screen.getByTestId('card-link-search')).toHaveValue('GM-7 Ship the release')
  })

  /**
   * Re-opening a filled field offers every card rather than the one already in it — the field stays
   * re-choosable and not merely re-typeable, as `Combobox` does.
   */
  it('offers the other cards again when the filled field is re-opened', async () => {
    renderRow([card('c2', { title: 'Ship the release' }), card('c3', { title: 'Unrelated' })])

    await userEvent.click(screen.getByTestId('card-link-option-c2'))
    await userEvent.click(screen.getByTestId('card-link-search'))

    expect(screen.getByTestId('card-link-option-c3')).toBeInTheDocument()
  })

  /** Escape closes the list it opened; a second one abandons the row, which is what is left to close. */
  it('closes the list on Escape, then the row', async () => {
    const { onCancel } = renderRow()
    // The row focuses its own search field on mount, so the keystrokes land there without a click —
    // which would re-open the list this is about closing.
    expect(screen.getByTestId('card-link-search')).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByTestId('card-link-option-c2')).not.toBeInTheDocument()
    expect(onCancel).not.toHaveBeenCalled()

    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalled()
  })
})
