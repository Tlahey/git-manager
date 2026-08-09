import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CardArchivedBadge } from './CardArchivedBadge'

describe('CardArchivedBadge', () => {
  it('says the card is archived', () => {
    render(<CardArchivedBadge archivedAt="2026-08-04T09:30:00.000Z" testId="badge" />)
    expect(screen.getByTestId('badge')).toHaveTextContent('Archived')
  })

  /** The caller passes `card.archivedAt` straight through and needs no condition of its own. */
  it('renders nothing for a card that is not archived', () => {
    render(<CardArchivedBadge archivedAt={undefined} testId="badge" />)
    expect(screen.queryByTestId('badge')).not.toBeInTheDocument()
  })

  /** "Archived" is the fact worth reading at a glance; *when* is the follow-up question. */
  it('keeps the date out of the label', () => {
    render(<CardArchivedBadge archivedAt="2026-08-04T09:30:00.000Z" testId="badge" />)
    expect(screen.getByTestId('badge')).not.toHaveTextContent('2026-08-04')
  })

  it('renders in both densities', () => {
    const { rerender } = render(<CardArchivedBadge archivedAt="2026-08-04" testId="badge" />)
    expect(screen.getByTestId('badge').className).not.toContain('text-[10px]')

    rerender(<CardArchivedBadge archivedAt="2026-08-04" compact testId="badge" />)
    expect(screen.getByTestId('badge').className).toContain('text-[10px]')
  })
})
