import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithLanguage } from '../../test/i18n'
import { SummaryDayCard } from './SummaryDayCard'
import type { StoredDailySummary } from '../../stores/dailySummary.store'

function entry(overrides: Partial<StoredDailySummary> = {}): StoredDailySummary {
  return {
    repoPath: '/p/git-manager',
    repoName: 'git-manager',
    date: '2026-07-27',
    branch: 'origin/main',
    generatedAt: Date.UTC(2026, 6, 27, 8, 0),
    commitCount: 7,
    fileCount: 12,
    filePath: '/archive/git-manager/2026-07-27.md',
    summary: {
      headline: 'Shipped the summaries archive',
      highlights: ['added the markdown archive', 'scoped the window to main'],
    },
    ...overrides,
  }
}

function renderCard(overrides: Partial<StoredDailySummary> = {}) {
  const handlers = {
    onOpenInEditor: vi.fn(),
    onReveal: vi.fn(),
    onDelete: vi.fn(),
  }
  render(<SummaryDayCard entry={entry(overrides)} {...handlers} />)
  return handlers
}

describe('SummaryDayCard', () => {
  it('renders its own date, the branch, the headline and both lists', () => {
    renderCard()
    expect(screen.getByText(/27 July|July 27|lundi/i)).toBeInTheDocument()
    expect(screen.getByText('origin/main')).toBeInTheDocument()
    expect(screen.getByText('Shipped the summaries archive')).toBeInTheDocument()
    expect(screen.getByText('added the markdown archive')).toBeInTheDocument()
    expect(screen.getByText('scoped the window to main')).toBeInTheDocument()
    expect(screen.getByText('What landed')).toBeInTheDocument()
  })

  /** A record of a day describes that day; there is no forward-looking section any more. */
  it('shows no "today / next steps" section', () => {
    renderCard()
    expect(screen.queryByText('Today')).not.toBeInTheDocument()
  })

  /** Parsed at local noon so the label can't slip a day in a negative-offset time zone. */
  it('dates the card from its own day, not the generation timestamp', () => {
    renderCard({ date: '2026-07-20', generatedAt: Date.UTC(2026, 6, 27) })
    expect(screen.getByTestId('summary-card-2026-07-20')).toBeInTheDocument()
    expect(screen.getByTestId('summary-card-2026-07-20')).toHaveTextContent(/20/)
  })

  it('states what the briefing was built from', () => {
    renderCard()
    expect(screen.getByText('7 commits · 12 files')).toBeInTheDocument()
  })

  it('shows the per-list empty message when a section is empty', () => {
    renderCard({ summary: { headline: 'Quiet', highlights: [] } })
    expect(screen.getByText('Nothing landed that day.')).toBeInTheDocument()
  })

  it('opens the file in the editor, passing the entry', async () => {
    const { onOpenInEditor } = renderCard()
    const user = userEvent.setup()
    await user.click(screen.getByTestId('summary-open-in-editor'))
    expect(onOpenInEditor).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-07-27' }))
  })

  it('reveals the archive folder and deletes the briefing', async () => {
    const { onReveal, onDelete } = renderCard()
    const user = userEvent.setup()
    await user.click(screen.getByTestId('summary-reveal'))
    expect(onReveal).toHaveBeenCalledOnce()
    await user.click(screen.getByTestId('summary-delete'))
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-07-27' }))
  })

  it('gives the icon-only actions accessible names', () => {
    renderCard()
    expect(screen.getByTestId('summary-open-in-editor')).toHaveAccessibleName('Open in editor')
    expect(screen.getByTestId('summary-delete')).toHaveAccessibleName('Delete this briefing')
  })

  it('labels the actions through a real tooltip rather than a title attribute', async () => {
    renderCard()
    const user = userEvent.setup()
    const reveal = screen.getByTestId('summary-reveal')
    expect(reveal).not.toHaveAttribute('title')
    await user.hover(reveal)
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('Reveal in Finder'))
  })

  it('renders the French copy when the app is in French', () => {
    renderWithLanguage(
      <SummaryDayCard
        entry={entry()}
        onOpenInEditor={vi.fn()}
        onReveal={vi.fn()}
        onDelete={vi.fn()}
      />,
      'fr'
    )
    expect(screen.getByText('Ce qui a été livré')).toBeInTheDocument()
    expect(screen.getByText('7 commits · 12 fichiers')).toBeInTheDocument()
  })
})
