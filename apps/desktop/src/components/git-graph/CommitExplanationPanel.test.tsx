import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CommitExplanationSubject } from '../../hooks/useCommitExplanation'

const explanation = vi.hoisted(() => ({
  explain: vi.fn(),
  cancel: vi.fn(),
  clear: vi.fn(),
  status: 'idle' as string,
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

vi.mock('../../hooks/useCommitExplanation', () => ({
  useCommitExplanation: () => explanation,
}))
vi.mock('../Markdown', () => ({
  Markdown: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}))

import { CommitExplanationPanel } from './CommitExplanationPanel'

function commit(overrides: Partial<CommitExplanationSubject> = {}): CommitExplanationSubject {
  return {
    oid: 'abc1234def',
    shortOid: 'abc1234',
    subject: 'feat: add login',
    body: '',
    author: 'Ada',
    parentCount: 1,
    ...overrides,
  }
}

function renderPanel(subject = commit()) {
  const onClose = vi.fn()
  const utils = render(
    <CommitExplanationPanel repoPath="/repo" commit={subject} onClose={onClose} />
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

describe('CommitExplanationPanel', () => {
  it('shows the sha and the subject of the commit that was clicked', () => {
    renderPanel()
    expect(screen.getByTestId('commit-explanation-sha')).toHaveTextContent('abc1234')
    expect(screen.getByText('feat: add login')).toBeInTheDocument()
  })

  it('starts generating as soon as it opens — the menu click was the request', () => {
    renderPanel()
    expect(explanation.explain).toHaveBeenCalled()
  })

  it('does not regenerate over a remembered summary', () => {
    explanation.text = 'already summarized'
    explanation.hasStored = true
    renderPanel()
    expect(explanation.explain).not.toHaveBeenCalled()
  })

  it('generates on demand', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByTestId('explanation-generate'))
    expect(explanation.explain).toHaveBeenCalled()
  })

  it('says what an ordinary commit is compared against', () => {
    renderPanel()
    expect(screen.getByText('compared to its parent commit')).toBeInTheDocument()
  })

  it('is explicit that a merge is read against its first parent only', () => {
    renderPanel(commit({ parentCount: 2 }))
    expect(screen.getByText('merge commit — compared to its first parent')).toBeInTheDocument()
  })

  it('is explicit that a root commit has no parent', () => {
    renderPanel(commit({ parentCount: 0 }))
    expect(screen.getByText('root commit — compared to an empty tree')).toBeInTheDocument()
  })

  it('renders a remembered summary as markdown', () => {
    explanation.text = '**Adds a constant**'
    explanation.generatedAt = Date.now() - 60_000
    explanation.comparedTo = 'abc1234^'
    explanation.hasStored = true
    renderPanel()
    expect(screen.getByTestId('markdown')).toHaveTextContent('**Adds a constant**')
    expect(screen.getByTestId('explanation-age')).toBeInTheDocument()
  })

  it('decodes the empty-commit sentinel', () => {
    explanation.status = 'error'
    explanation.error = 'AI_NO_COMMIT_CHANGES'
    renderPanel()
    expect(screen.getByTestId('explanation-error')).toHaveTextContent(
      'This commit has no textual changes to explain.'
    )
  })

  it('closes from the header', async () => {
    const user = userEvent.setup()
    const { onClose } = renderPanel()
    await user.click(screen.getByTestId('explanation-close'))
    expect(onClose).toHaveBeenCalled()
  })
})

// What the notice *says* is covered once, in components/CoverageNotice.test.tsx — it is shared with
// the code review. What matters here is that a commit's explanation carries one at all: it reads as
// confident whether the model saw six files of a squashed merge or all forty.
describe('CommitExplanationPanel — coverage', () => {
  it('says how much of a large commit was actually read', () => {
    explanation.coverage = {
      filesRead: 6,
      filesTotal: 40,
      complete: false,
      requiredContextTokens: 32768,
      windowTooSmall: false,
    }
    renderPanel()
    expect(screen.getByTestId('commit-explanation-coverage')).toHaveTextContent(
      'Read 6 of 40 changed files in full'
    )
  })

  it('stays silent on a commit that fit whole', () => {
    explanation.coverage = {
      filesRead: 3,
      filesTotal: 3,
      complete: true,
      requiredContextTokens: 8192,
      windowTooSmall: false,
    }
    renderPanel()
    expect(screen.queryByTestId('commit-explanation-coverage')).not.toBeInTheDocument()
  })
})
