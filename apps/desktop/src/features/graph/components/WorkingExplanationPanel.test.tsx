import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const explanation = vi.hoisted(() => ({
  explain: vi.fn(),
  cancel: vi.fn(),
  clear: vi.fn(),
  status: 'idle',
  isGenerating: false,
  error: null as string | null,
  text: '',
  coverage: null as {
    filesRead: number
    filesTotal: number
    complete: boolean
    requiredContextTokens: number
    windowTooSmall: boolean
  } | null,
}))

vi.mock('../hooks/useWorkingExplanation', () => ({
  useWorkingExplanation: () => explanation,
}))
vi.mock('../../../components/Markdown', () => ({
  Markdown: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}))

import { WorkingExplanationPanel } from './WorkingExplanationPanel'

function renderPanel() {
  const onClose = vi.fn()
  const utils = render(<WorkingExplanationPanel repoPath="/repo" onClose={onClose} />)
  return { ...utils, onClose }
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(explanation, {
    status: 'idle',
    isGenerating: false,
    error: null,
    text: '',
    coverage: null,
  })
})

describe('WorkingExplanationPanel', () => {
  it('names the subject and what it is compared against', () => {
    renderPanel()
    expect(screen.getByTestId('working-explanation-subject')).toHaveTextContent(
      'Uncommitted changes'
    )
    expect(screen.getByText('working tree compared to HEAD')).toBeInTheDocument()
  })

  it('starts generating as soon as it opens', () => {
    renderPanel()
    expect(explanation.explain).toHaveBeenCalled()
  })

  it('never shows an age — nothing is remembered for a moving target', () => {
    explanation.text = 'a summary'
    renderPanel()
    expect(screen.queryByTestId('explanation-age')).not.toBeInTheDocument()
    expect(screen.queryByTestId('explanation-stale-base')).not.toBeInTheDocument()
  })

  it('renders the summary as markdown', () => {
    explanation.text = '**Two things in flight**'
    renderPanel()
    expect(screen.getByTestId('markdown')).toHaveTextContent('**Two things in flight**')
  })

  it('shows progress and a stop button while streaming', () => {
    explanation.status = 'streaming'
    explanation.isGenerating = true
    renderPanel()
    expect(screen.getByTestId('explanation-stop')).toBeInTheDocument()
  })

  it('decodes the clean-tree sentinel', () => {
    explanation.status = 'error'
    explanation.error = 'AI_NO_WORKING_CHANGES'
    renderPanel()
    expect(screen.getByTestId('explanation-error')).toHaveTextContent(
      'There are no uncommitted changes to summarize.'
    )
  })

  it('closes from the header', async () => {
    const user = userEvent.setup()
    const { onClose } = renderPanel()
    await user.click(screen.getByTestId('explanation-close'))
    expect(onClose).toHaveBeenCalled()
  })
})

// The stake specific to this panel: the summary's job is to say how many separate things are in
// progress, and that count comes from files the model may not have read the diff of.
