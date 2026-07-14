import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

const { useDailySummary } = vi.hoisted(() => ({ useDailySummary: vi.fn() }))
vi.mock('../../../hooks/useDailySummary', () => ({ useDailySummary }))

import { DailySummaryPanel } from './DailySummaryPanel'

interface HookState {
  summary: null | { headline: string; yesterday: string[]; today: string[] }
  generatedAt: number | null
  isStale: boolean
  isGenerating: boolean
  error: string | null
  generate: ReturnType<typeof vi.fn>
}

function buildState(overrides: Partial<HookState> = {}): HookState {
  return {
    summary: null,
    generatedAt: null,
    isStale: true,
    isGenerating: false,
    error: null,
    generate: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DailySummaryPanel', () => {
  it('renders the headline and both bullet lists when a summary exists', () => {
    useDailySummary.mockReturnValue(
      buildState({
        summary: {
          headline: 'Shipped the summary feature',
          yesterday: ['added the panel', 'wired the backend'],
          today: ['write more tests'],
        },
        generatedAt: Date.now(),
      })
    )
    render(<DailySummaryPanel path="/repo/a" onClose={vi.fn()} />)
    expect(screen.getByText('Shipped the summary feature')).toBeInTheDocument()
    expect(screen.getByText('added the panel')).toBeInTheDocument()
    expect(screen.getByText('write more tests')).toBeInTheDocument()
    expect(screen.getByTestId('daily-summary-content')).toBeInTheDocument()
  })

  it('shows a generate call-to-action when there is no summary yet', async () => {
    const generate = vi.fn()
    useDailySummary.mockReturnValue(buildState({ generate }))
    const user = userEvent.setup()
    render(<DailySummaryPanel path="/repo/a" onClose={vi.fn()} />)
    expect(screen.getByText('dashboard.summary.empty')).toBeInTheDocument()
    await user.click(screen.getByText('dashboard.summary.generate'))
    expect(generate).toHaveBeenCalledOnce()
  })

  it('shows a spinner while generating with no prior summary', () => {
    useDailySummary.mockReturnValue(buildState({ isGenerating: true }))
    render(<DailySummaryPanel path="/repo/a" onClose={vi.fn()} />)
    expect(screen.getByText('dashboard.summary.generating')).toBeInTheDocument()
  })

  it('surfaces the error with a retry that regenerates', async () => {
    const generate = vi.fn()
    useDailySummary.mockReturnValue(buildState({ error: 'provider unreachable', generate }))
    const user = userEvent.setup()
    render(<DailySummaryPanel path="/repo/a" onClose={vi.fn()} />)
    expect(screen.getByText('provider unreachable')).toBeInTheDocument()
    await user.click(screen.getByText('dashboard.summary.retry'))
    expect(generate).toHaveBeenCalledOnce()
  })

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
      buildState({ summary: { headline: 'h', yesterday: [], today: [] }, generate })
    )
    const user = userEvent.setup()
    render(<DailySummaryPanel path="/repo/a" onClose={vi.fn()} />)
    await user.click(screen.getByTestId('daily-summary-refresh-button'))
    expect(generate).toHaveBeenCalledOnce()
  })
})
