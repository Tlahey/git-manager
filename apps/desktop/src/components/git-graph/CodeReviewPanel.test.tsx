import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const codeReview = vi.hoisted(() => ({
  review: vi.fn(),
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

const seenTargets = vi.hoisted(() => [] as unknown[])

vi.mock('../../hooks/useCodeReview', () => ({
  useCodeReview: (_repoPath: string, target: unknown) => {
    seenTargets.push(target)
    return codeReview
  },
}))
vi.mock('../Markdown', () => ({
  Markdown: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}))

import { CodeReviewPanel } from './CodeReviewPanel'

function renderWorking() {
  const onClose = vi.fn()
  const utils = render(
    <CodeReviewPanel repoPath="/repo" target={{ scope: 'working' }} onClose={onClose} />
  )
  return { ...utils, onClose }
}

function renderBranch(baseRef = 'origin/main') {
  const onClose = vi.fn()
  const utils = render(
    <CodeReviewPanel
      repoPath="/repo"
      target={{ scope: 'branch', branch: 'feat/login' }}
      baseRef={baseRef}
      onClose={onClose}
    />
  )
  return { ...utils, onClose }
}

beforeEach(() => {
  vi.clearAllMocks()
  seenTargets.length = 0
  Object.assign(codeReview, {
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

describe('CodeReviewPanel — working target', () => {
  it('names the subject and what it is read against', () => {
    renderWorking()
    expect(screen.getByTestId('code-review-subject')).toHaveTextContent('Uncommitted changes')
    expect(screen.getByText('reviewed against the last commit')).toBeInTheDocument()
  })

  it('asks the hook for the working scope', () => {
    renderWorking()
    expect(seenTargets[0]).toEqual({ scope: 'working' })
  })

  it('starts reviewing as soon as it opens', () => {
    renderWorking()
    expect(codeReview.review).toHaveBeenCalled()
  })

  it('decodes the clean-tree sentinel', () => {
    codeReview.status = 'error'
    codeReview.error = 'AI_NO_WORKING_CHANGES'
    renderWorking()
    expect(screen.getByTestId('explanation-error')).toHaveTextContent(
      'There are no uncommitted changes to summarize.'
    )
  })
})

describe('CodeReviewPanel — branch target', () => {
  it('names the branch and the base it is read against', () => {
    renderBranch()
    expect(screen.getByTestId('code-review-subject')).toHaveTextContent('feat/login')
    expect(screen.getByText('reviewed against origin/main')).toBeInTheDocument()
  })

  it('asks the hook for the branch scope, and reviews against the given base', () => {
    renderBranch()
    expect(seenTargets[0]).toEqual({ scope: 'branch', branch: 'feat/login' })
    expect(codeReview.review).toHaveBeenCalledWith('origin/main')
  })

  it('warns when the remembered review used another base', () => {
    codeReview.text = 'a review'
    codeReview.comparedTo = 'origin/dev'
    renderBranch('origin/main')
    expect(screen.getByTestId('explanation-stale-base')).toBeInTheDocument()
  })

  it('does not warn when the remembered review used the current base', () => {
    codeReview.text = 'a review'
    codeReview.comparedTo = 'origin/main'
    renderBranch('origin/main')
    expect(screen.queryByTestId('explanation-stale-base')).not.toBeInTheDocument()
  })

  it('decodes the unchanged-branch sentinel', () => {
    codeReview.status = 'error'
    codeReview.error = 'AI_NO_BRANCH_CHANGES'
    renderBranch()
    expect(screen.getByTestId('explanation-error')).toHaveTextContent(
      'This branch has no changes compared to its base branch.'
    )
  })
})

describe('CodeReviewPanel — shared chrome', () => {
  it('renders the review as markdown', () => {
    codeReview.text = '**Bug in `a.ts`**'
    renderWorking()
    expect(screen.getByTestId('markdown')).toHaveTextContent('**Bug in `a.ts`**')
  })

  it('offers a stop button while streaming', () => {
    codeReview.status = 'streaming'
    codeReview.isGenerating = true
    renderWorking()
    expect(screen.getByTestId('explanation-stop')).toBeInTheDocument()
  })

  it('closes from the header', async () => {
    const user = userEvent.setup()
    const { onClose } = renderWorking()
    await user.click(screen.getByTestId('explanation-close'))
    expect(onClose).toHaveBeenCalled()
  })
})

// What the notice *says* is covered once, in components/CoverageNotice.test.tsx — it is shared with
// the commit explanation. What matters here is only that this panel hands its own coverage over,
// under its own testid prefix.
describe('CodeReviewPanel — coverage', () => {
  it('says nothing when the whole change was read', () => {
    codeReview.coverage = {
      filesRead: 8,
      filesTotal: 8,
      complete: true,
      requiredContextTokens: 8192,
      windowTooSmall: false,
    }
    renderWorking()
    expect(screen.queryByTestId('code-review-coverage')).not.toBeInTheDocument()
  })

  it('reports what it read and the window needed to read it all', () => {
    codeReview.coverage = {
      filesRead: 14,
      filesTotal: 50,
      complete: false,
      requiredContextTokens: 32768,
      windowTooSmall: false,
    }
    renderWorking()
    const notice = screen.getByTestId('code-review-coverage')
    expect(notice).toHaveTextContent('Read 14 of 50 changed files in full')
    expect(notice).toHaveTextContent('about a 32k-token context window')
  })

  it('warns when the window leaves no room for any diff', () => {
    codeReview.coverage = {
      filesRead: 0,
      filesTotal: 12,
      complete: false,
      requiredContextTokens: 32768,
      windowTooSmall: true,
    }
    renderWorking()
    expect(screen.getByTestId('code-review-window-too-small')).toHaveTextContent(
      'leaves no room for the diff'
    )
  })
})
