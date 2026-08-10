import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithLanguage } from '../../../test/i18n'

const { useDailySummary } = vi.hoisted(() => ({ useDailySummary: vi.fn() }))
vi.mock('../../../hooks/useDailySummary', () => ({ useDailySummary }))

import { DailySummaryPanel } from './DailySummaryPanel'

interface HookState {
  summary: null | { headline: string; highlights: string[] }
  generatedAt: number | null
  filePath: string | null
  isStale: boolean
  isGenerating: boolean
  progress: { phase: 'summarizing' | 'composing'; completed: number; total: number } | null
  skipped: boolean
  error: string | null
  generate: ReturnType<typeof vi.fn>
}

function buildState(overrides: Partial<HookState> = {}): HookState {
  return {
    summary: null,
    generatedAt: null,
    filePath: null,
    isStale: true,
    isGenerating: false,
    progress: null,
    skipped: false,
    error: null,
    generate: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DailySummaryPanel — content', () => {
  it('renders the headline and both bullet lists when a summary exists', () => {
    useDailySummary.mockReturnValue(
      buildState({
        summary: {
          headline: 'Shipped the summary feature',
          highlights: ['added the panel', 'wired the backend'],
        },
        generatedAt: Date.now(),
      })
    )
    render(<DailySummaryPanel path="/repo/a" onClose={vi.fn()} />)
    expect(screen.getByText('Shipped the summary feature')).toBeInTheDocument()
    expect(screen.getByText('added the panel')).toBeInTheDocument()
    expect(screen.getByText('wired the backend')).toBeInTheDocument()
    expect(screen.getByTestId('daily-summary-content')).toBeInTheDocument()
  })

  it('titles the panel and names the project', () => {
    useDailySummary.mockReturnValue(buildState())
    render(<DailySummaryPanel path="/Users/me/projects/repo-a" onClose={vi.fn()} />)
    expect(screen.getByText('Daily briefing')).toBeInTheDocument()
    expect(screen.getByText('repo-a')).toBeInTheDocument()
  })

  it('heads each list and shows a per-list empty message', () => {
    useDailySummary.mockReturnValue(buildState({ summary: { headline: 'h', highlights: [] } }))
    render(<DailySummaryPanel path="/repo/a" onClose={vi.fn()} />)
    expect(screen.getByText('What landed')).toBeInTheDocument()
    expect(screen.getByText('Nothing landed that day.')).toBeInTheDocument()
    // A record of a day has no forward-looking section any more.
    expect(screen.queryByText('Today')).not.toBeInTheDocument()
  })

  it('interpolates the generation time into the timestamp line', () => {
    useDailySummary.mockReturnValue(
      buildState({
        summary: { headline: 'h', highlights: [] },
        generatedAt: Date.UTC(2026, 6, 25, 12, 0),
      })
    )
    render(<DailySummaryPanel path="/repo/a" onClose={vi.fn()} />)
    expect(screen.getByText(/^Generated .+/)).toBeInTheDocument()
  })

  it('shows a generate call-to-action when there is no summary yet', async () => {
    const generate = vi.fn()
    useDailySummary.mockReturnValue(buildState({ generate }))
    const user = userEvent.setup()
    render(<DailySummaryPanel path="/repo/a" onClose={vi.fn()} />)
    expect(
      screen.getByText('Generate a briefing to see what was done and what could be planned.')
    ).toBeInTheDocument()
    await user.click(screen.getByText('Generate (LLM)'))
    expect(generate).toHaveBeenCalledOnce()
  })

  it('shows a spinner while generating with no prior summary', () => {
    useDailySummary.mockReturnValue(buildState({ isGenerating: true }))
    render(<DailySummaryPanel path="/repo/a" onClose={vi.fn()} />)
    expect(screen.getByText('Generating briefing…')).toBeInTheDocument()
  })

  /** Generation is one model call per changed file plus one, so a bare spinner would leave the user
   * unable to tell a slow model from a stuck one. */
  it('counts the files as the map phase reads them', () => {
    useDailySummary.mockReturnValue(
      buildState({
        isGenerating: true,
        progress: { phase: 'summarizing', completed: 3, total: 12 },
      })
    )
    render(<DailySummaryPanel path="/repo/a" onClose={vi.fn()} />)
    expect(screen.getByTestId('daily-summary-progress')).toHaveTextContent('Reading file 3 of 12…')
  })

  it('reports the composing phase once the files are read', () => {
    useDailySummary.mockReturnValue(
      buildState({ isGenerating: true, progress: { phase: 'composing', completed: 0, total: 1 } })
    )
    render(<DailySummaryPanel path="/repo/a" onClose={vi.fn()} />)
    expect(screen.getByTestId('daily-summary-progress')).toHaveTextContent('Writing the briefing…')
  })

  /** A quiet repository must not read as a failure. */
  it('reports "nothing landed" as its own state, not as an error', () => {
    useDailySummary.mockReturnValue(buildState({ skipped: true }))
    render(<DailySummaryPanel path="/repo/a" onClose={vi.fn()} />)
    expect(screen.getByTestId('daily-summary-skipped')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Nothing landed on the main branch in this window, so there is no briefing to write.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText("Couldn't generate the briefing")).not.toBeInTheDocument()
  })

  it('keeps showing the archived briefing when a later run skips', () => {
    useDailySummary.mockReturnValue(
      buildState({ skipped: true, summary: { headline: 'Yesterday’s work', highlights: [] } })
    )
    render(<DailySummaryPanel path="/repo/a" onClose={vi.fn()} />)
    expect(screen.getByTestId('daily-summary-content')).toBeInTheDocument()
  })

  it('surfaces the error with a retry that regenerates', async () => {
    const generate = vi.fn()
    useDailySummary.mockReturnValue(buildState({ error: 'provider unreachable', generate }))
    const user = userEvent.setup()
    render(<DailySummaryPanel path="/repo/a" onClose={vi.fn()} />)
    expect(screen.getByText("Couldn't generate the briefing")).toBeInTheDocument()
    expect(screen.getByText('provider unreachable')).toBeInTheDocument()
    await user.click(screen.getByText('Retry'))
    expect(generate).toHaveBeenCalledOnce()
  })

  it('renders the French copy when the app is in French', () => {
    useDailySummary.mockReturnValue(buildState({ isGenerating: true }))
    renderWithLanguage(<DailySummaryPanel path="/repo/a" onClose={vi.fn()} />, 'fr')
    expect(screen.getByText('Génération du briefing…')).toBeInTheDocument()
  })
})

describe('DailySummaryPanel — header controls', () => {
  it('calls onClose from the close button', async () => {
    const onClose = vi.fn()
    useDailySummary.mockReturnValue(buildState())
    const user = userEvent.setup()
    render(<DailySummaryPanel path="/repo/a" onClose={onClose} />)
    await user.click(screen.getByTestId('daily-summary-close-button'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('triggers regeneration from the header refresh button', async () => {
    const generate = vi.fn()
    useDailySummary.mockReturnValue(
      buildState({ summary: { headline: 'h', highlights: [] }, generate })
    )
    const user = userEvent.setup()
    render(<DailySummaryPanel path="/repo/a" onClose={vi.fn()} />)
    await user.click(screen.getByTestId('daily-summary-refresh-button'))
    expect(generate).toHaveBeenCalledOnce()
  })

  it('gives the icon-only close button an accessible name', () => {
    useDailySummary.mockReturnValue(buildState())
    render(<DailySummaryPanel path="/repo/a" onClose={vi.fn()} />)
    expect(screen.getByTestId('daily-summary-close-button')).toHaveAccessibleName('Close')
  })

  it('names the refresh button even when its label is hidden at narrow widths', () => {
    useDailySummary.mockReturnValue(buildState())
    render(<DailySummaryPanel path="/repo/a" onClose={vi.fn()} />)
    expect(screen.getByTestId('daily-summary-refresh-button')).toHaveAccessibleName('Regenerate')
  })

  it('exposes the close label through a real tooltip rather than a title attribute', async () => {
    useDailySummary.mockReturnValue(buildState())
    const user = userEvent.setup()
    render(<DailySummaryPanel path="/repo/a" onClose={vi.fn()} />)
    const close = screen.getByTestId('daily-summary-close-button')
    expect(close).not.toHaveAttribute('title')
    await user.hover(close)
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('Close'))
  })

  it('disables the refresh button while a generation is in flight', () => {
    useDailySummary.mockReturnValue(buildState({ isGenerating: true }))
    render(<DailySummaryPanel path="/repo/a" onClose={vi.fn()} />)
    expect(screen.getByTestId('daily-summary-refresh-button')).toBeDisabled()
  })
})
