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
  generatedAt: null as number | null,
  comparedTo: null as string | null,
  hasStored: false,
  coverage: null as {
    filesRead: number
    filesTotal: number
    complete: boolean
    requiredContextTokens: number
    windowTooSmall: boolean
  } | null,
}))

vi.mock('../../hooks/useBranchExplanation', () => ({
  useBranchExplanation: () => explanation,
}))
vi.mock('../Markdown', () => ({
  Markdown: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}))

import { BranchExplanationPanel } from './BranchExplanationPanel'

function renderPanel(props: Partial<React.ComponentProps<typeof BranchExplanationPanel>> = {}) {
  const onClose = vi.fn()
  const utils = render(
    <BranchExplanationPanel
      repoPath="/repo"
      branch="feat/login"
      baseRef="origin/main"
      onClose={onClose}
      {...props}
    />
  )
  return { ...utils, onClose }
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(explanation, {
    status: 'idle',
    isGenerating: false,
    error: null,
    text: '',
    generatedAt: null,
    comparedTo: null,
    hasStored: false,
    coverage: null,
  })
})

describe('BranchExplanationPanel', () => {
  it('names the branch and the base it is compared against', () => {
    renderPanel()
    expect(screen.getByTestId('branch-explanation-branch')).toHaveTextContent('feat/login')
    expect(screen.getByText('compared to origin/main')).toBeInTheDocument()
  })

  it('starts generating as soon as it opens — the menu click was the request', () => {
    renderPanel()
    expect(explanation.explain).toHaveBeenCalledWith('origin/main')
  })

  it('does not regenerate over a remembered summary', () => {
    explanation.text = 'already summarized'
    explanation.hasStored = true
    renderPanel()
    expect(explanation.explain).not.toHaveBeenCalled()
  })

  it('generates on demand, against the current base', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByTestId('explanation-generate'))
    expect(explanation.explain).toHaveBeenCalledWith('origin/main')
  })

  it('renders a remembered summary as markdown, with its age', () => {
    explanation.text = '**Adds a login page**'
    explanation.generatedAt = Date.now() - 3_600_000
    explanation.comparedTo = 'origin/main'
    explanation.hasStored = true
    renderPanel()

    expect(screen.getByTestId('markdown')).toHaveTextContent('**Adds a login page**')
    expect(screen.getByTestId('explanation-age')).toBeInTheDocument()
    // A remembered summary offers regeneration rather than a first generation.
    expect(screen.getByTestId('explanation-generate')).toHaveTextContent('Regenerate')
  })

  it('shows progress and a stop button while streaming', () => {
    explanation.status = 'streaming'
    explanation.isGenerating = true
    renderPanel()
    expect(screen.getByText('Reading the changes…')).toBeInTheDocument()
    expect(screen.getByTestId('explanation-stop')).toBeInTheDocument()
    expect(screen.queryByTestId('explanation-generate')).not.toBeInTheDocument()
  })

  it('stops a running generation', async () => {
    explanation.status = 'streaming'
    explanation.isGenerating = true
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByTestId('explanation-stop'))
    expect(explanation.cancel).toHaveBeenCalled()
  })

  it('forgets a remembered summary on demand', async () => {
    explanation.text = 'something'
    explanation.hasStored = true
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByTestId('explanation-forget'))
    expect(explanation.clear).toHaveBeenCalled()
  })

  it('warns when the remembered summary used a different base', () => {
    explanation.text = 'something'
    explanation.comparedTo = 'origin/develop'
    explanation.hasStored = true
    renderPanel()
    expect(screen.getByTestId('explanation-stale-base')).toHaveTextContent('origin/develop')
  })

  it('says nothing about the base when it still matches', () => {
    explanation.text = 'something'
    explanation.comparedTo = 'origin/main'
    renderPanel()
    expect(screen.queryByTestId('explanation-stale-base')).not.toBeInTheDocument()
  })

  it('decodes a provider failure instead of showing the raw sentinel', () => {
    explanation.status = 'error'
    explanation.error = 'AI_NO_BRANCH_CHANGES'
    renderPanel()
    expect(screen.getByTestId('explanation-error')).toHaveTextContent(
      'This branch has no changes compared to its base branch.'
    )
  })

  it('closes from the header', async () => {
    const user = userEvent.setup()
    const { onClose } = renderPanel()
    await user.click(screen.getByTestId('explanation-close'))
    expect(onClose).toHaveBeenCalled()
  })
})

// What the notice *says* is covered once, in components/CoverageNotice.test.tsx. What matters here
// is that a branch explanation carries one at all — a branch range is the largest diff the app
// sends, and the instruction now forbids the text itself from mentioning what it could not read.
