import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BoardCard } from '@git-manager/git-types'
import { makeCard } from '../test/boardFactories'
import { CardCandidateList } from './CardCandidateList'

function card(id: string, overrides: Partial<BoardCard> = {}): BoardCard {
  return makeCard({ id, boardId: 'b1', title: id, ...overrides })
}

function renderList(candidates: BoardCard[], query = '') {
  const onPick = vi.fn()
  render(<CardCandidateList candidates={candidates} query={query} onPick={onPick} />)
  return { onPick }
}

describe('CardCandidateList', () => {
  it('offers every candidate before anything is typed', () => {
    renderList([card('c1'), card('c2')])
    expect(screen.getByTestId('card-link-option-c1')).toBeInTheDocument()
    expect(screen.getByTestId('card-link-option-c2')).toBeInTheDocument()
  })

  it('narrows to what was typed', () => {
    renderList(
      [card('c1', { title: 'Ship the release' }), card('c2', { title: 'Unrelated' })],
      'ship'
    )
    expect(screen.getByTestId('card-link-option-c1')).toBeInTheDocument()
    expect(screen.queryByTestId('card-link-option-c2')).not.toBeInTheDocument()
  })

  it('hands back the card that was clicked', async () => {
    const target = card('c2', { title: 'Ship the release' })
    const { onPick } = renderList([card('c1'), target])

    await userEvent.click(screen.getByTestId('card-link-option-c2'))

    expect(onPick).toHaveBeenCalledWith(target)
  })

  /** A card is recognised on the board by its kind and its number; a list of bare titles makes the
   * user read sentences to find the ticket they already know the number of. */
  it('shows each candidate by its kind and its identifier, not by its title alone', () => {
    renderList([card('c1', { kind: 'epic', prefix: 'GM', number: 7, title: 'Redesign' })])

    expect(screen.getByTestId('card-kind-epic')).toBeInTheDocument()
    expect(screen.getByText('GM-7')).toBeInTheDocument()
    expect(screen.getByText('Redesign')).toBeInTheDocument()
  })

  it('says there is nothing to choose rather than showing an empty box', () => {
    renderList([])
    expect(screen.getByTestId('card-link-empty')).toHaveTextContent('No other card on this board.')
  })

  it('says the same when the query matches none of them', () => {
    renderList([card('c1', { title: 'Ship the release' })], 'nothing like it')
    expect(screen.getByTestId('card-link-empty')).toBeInTheDocument()
  })
})
