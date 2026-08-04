import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeBoard, makeCard } from '../../../test/boardFactories'
import { ArchivedCardsDialog } from './ArchivedCardsDialog'

const board = makeBoard({ cardPrefixes: ['GM'] })

const archived = (overrides = {}) =>
  makeCard({ archivedAt: '2026-08-01T00:00:00.000Z', ...overrides })

function renderDialog(cards = [archived()]) {
  const handlers = {
    onOpenCard: vi.fn(),
    onUnarchive: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn(),
  }
  render(
    <ArchivedCardsDialog open onOpenChange={() => {}} board={board} cards={cards} {...handlers} />
  )
  return handlers
}

describe('ArchivedCardsDialog', () => {
  it('lists the archived cards with their identifier and column', () => {
    renderDialog([archived({ id: 'c1', title: 'Buried task', prefix: 'GM', number: 3 })])
    const row = screen.getByTestId('archived-card-c1')
    expect(row).toHaveTextContent('GM-3')
    expect(row).toHaveTextContent('Buried task')
    expect(row).toHaveTextContent('To do')
  })

  /** The columns hide archived cards; this list is the opposite view, so a live card has no place. */
  it('leaves live cards out', () => {
    renderDialog([archived({ id: 'c1' }), makeCard({ id: 'c2', title: 'Still on the board' })])
    expect(screen.getByTestId('archived-card-c1')).toBeInTheDocument()
    expect(screen.queryByTestId('archived-card-c2')).not.toBeInTheDocument()
  })

  it('says so when nothing has been archived, and offers no search box', () => {
    renderDialog([makeCard()])
    expect(screen.getByTestId('archived-none')).toBeInTheDocument()
    expect(screen.queryByTestId('archived-search-input')).not.toBeInTheDocument()
  })

  it('searches by title and by identifier', async () => {
    renderDialog([
      archived({ id: 'c1', title: 'Buried task', prefix: 'GM', number: 3 }),
      archived({ id: 'c2', title: 'Other thing', prefix: 'GM', number: 4 }),
    ])

    await userEvent.type(screen.getByTestId('archived-search-input'), 'buried')
    expect(screen.getByTestId('archived-card-c1')).toBeInTheDocument()
    expect(screen.queryByTestId('archived-card-c2')).not.toBeInTheDocument()

    await userEvent.clear(screen.getByTestId('archived-search-input'))
    await userEvent.type(screen.getByTestId('archived-search-input'), 'GM-4')
    expect(screen.getByTestId('archived-card-c2')).toBeInTheDocument()
    expect(screen.queryByTestId('archived-card-c1')).not.toBeInTheDocument()
  })

  it('reports a search that matches nothing', async () => {
    renderDialog()
    await userEvent.type(screen.getByTestId('archived-search-input'), 'nothing like this')
    expect(screen.getByTestId('archived-empty')).toBeInTheDocument()
  })

  /** Newest first: the card you want back is usually the one you just put away. */
  it('lists the most recently archived first', () => {
    renderDialog([
      archived({ id: 'old', archivedAt: '2026-01-01T00:00:00.000Z' }),
      archived({ id: 'new', archivedAt: '2026-08-01T00:00:00.000Z' }),
    ])
    const rows = screen.getAllByTestId(/^archived-card-/)
    expect(rows[0]).toHaveAttribute('data-testid', 'archived-card-new')
  })

  it('restores a card', async () => {
    const { onUnarchive } = renderDialog([archived({ id: 'c1' })])
    await userEvent.click(screen.getByTestId('archived-card-unarchive-c1'))
    expect(onUnarchive).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }))
  })

  it('opens a card', async () => {
    const { onOpenCard } = renderDialog([archived({ id: 'c1' })])
    await userEvent.click(screen.getByTestId('archived-card-open-c1'))
    expect(onOpenCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }))
  })

  /** Deleting is delegated, not done here — the confirmation belongs to the caller. */
  it('asks its caller to delete rather than deleting outright', async () => {
    const { onDelete } = renderDialog([archived({ id: 'c1' })])
    await userEvent.click(screen.getByTestId('archived-card-delete-c1'))
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }))
  })
})
