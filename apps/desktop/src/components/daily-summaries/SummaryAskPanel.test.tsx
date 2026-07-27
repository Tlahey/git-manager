import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithLanguage } from '../../test/i18n'
import { SummaryAskPanel } from './SummaryAskPanel'
import type { SummarySearchAnswer } from '@git-manager/ai'

interface Overrides {
  answer?: SummarySearchAnswer | null
  isAsking?: boolean
  error?: string | null
  aiEnabled?: boolean
}

function renderPanel(overrides: Overrides = {}) {
  const handlers = { onAsk: vi.fn(), onClear: vi.fn(), onSelectMatch: vi.fn() }
  render(
    <SummaryAskPanel
      answer={overrides.answer ?? null}
      isAsking={overrides.isAsking ?? false}
      error={overrides.error ?? null}
      aiEnabled={overrides.aiEnabled ?? true}
      {...handlers}
    />
  )
  return handlers
}

describe('SummaryAskPanel', () => {
  it('submits the typed question', async () => {
    const { onAsk } = renderPanel()
    const user = userEvent.setup()
    await user.type(screen.getByTestId('summary-ask-input'), 'when did I ship it?')
    await user.click(screen.getByTestId('summary-ask-submit'))
    expect(onAsk).toHaveBeenCalledWith('when did I ship it?')
  })

  it('keeps the submit button disabled until something is typed', async () => {
    renderPanel()
    expect(screen.getByTestId('summary-ask-submit')).toBeDisabled()
    await userEvent.setup().type(screen.getByTestId('summary-ask-input'), 'x')
    expect(screen.getByTestId('summary-ask-submit')).toBeEnabled()
  })

  it('disables the box and explains why when the AI provider is off', () => {
    renderPanel({ aiEnabled: false })
    expect(screen.getByTestId('summary-ask-input')).toBeDisabled()
    expect(screen.getByTestId('summary-ask-submit')).toBeDisabled()
    expect(
      screen.getByText('Enable the AI provider in Settings to ask questions about your archive.')
    ).toBeInTheDocument()
  })

  it('blocks a second submit while one is in flight', async () => {
    renderPanel({ isAsking: true })
    await userEvent.setup().type(screen.getByTestId('summary-ask-input'), 'x')
    expect(screen.getByTestId('summary-ask-submit')).toBeDisabled()
  })

  it('renders the answer and its cited days', () => {
    renderPanel({
      answer: {
        answer: 'You shipped it on the 21st.',
        matches: [{ repo: 'git-manager', date: '2026-07-21', reason: 'shipped it' }],
      },
    })
    expect(screen.getByText('You shipped it on the 21st.')).toBeInTheDocument()
    expect(screen.getByText('git-manager · 2026-07-21')).toBeInTheDocument()
  })

  it('jumps to a cited day when its chip is clicked', async () => {
    const { onSelectMatch } = renderPanel({
      answer: {
        answer: 'A',
        matches: [{ repo: 'git-manager', date: '2026-07-21', reason: 'shipped it' }],
      },
    })
    await userEvent.setup().click(screen.getByTestId('summary-answer-match'))
    expect(onSelectMatch).toHaveBeenCalledWith('git-manager', '2026-07-21')
  })

  it('renders an answer with no citations without a chip list', () => {
    renderPanel({ answer: { answer: 'Not covered by your archive.', matches: [] } })
    expect(screen.getByText('Not covered by your archive.')).toBeInTheDocument()
    expect(screen.queryByTestId('summary-answer-match')).not.toBeInTheDocument()
  })

  it('surfaces an error and offers to clear it', async () => {
    const { onClear } = renderPanel({ error: 'provider unreachable' })
    expect(screen.getByText("Couldn't answer the question")).toBeInTheDocument()
    expect(screen.getByText('provider unreachable')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByTestId('summary-ask-clear'))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('names the icon-only clear button', () => {
    renderPanel({ answer: { answer: 'A', matches: [] } })
    expect(screen.getByTestId('summary-ask-clear')).toHaveAccessibleName('Clear the answer')
  })

  it('labels the question field for assistive tech', () => {
    renderPanel()
    expect(screen.getByTestId('summary-ask-input')).toHaveAccessibleName(
      'Ask a question about your briefings'
    )
  })

  it('renders the French copy when the app is in French', () => {
    renderWithLanguage(
      <SummaryAskPanel
        answer={null}
        isAsking={false}
        error={null}
        aiEnabled
        onAsk={vi.fn()}
        onClear={vi.fn()}
        onSelectMatch={vi.fn()}
      />,
      'fr'
    )
    expect(screen.getByText('Demander')).toBeInTheDocument()
  })
})
