import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitDiffFile } from '@git-manager/git-types'

const explanation = vi.hoisted(() => ({
  explain: vi.fn(),
  cancel: vi.fn(),
  reset: vi.fn(),
  status: 'idle',
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

vi.mock('../../hooks/useChangeExplanation', () => ({
  useChangeExplanation: () => explanation,
}))

// The real renderer pulls the whole markdown pipeline in; this panel's job is what it hands over.
vi.mock('../Markdown', () => ({
  Markdown: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}))

import { ChangeExplanationPanel } from './ChangeExplanationPanel'

function diffFile(overrides: Partial<GitDiffFile> = {}): GitDiffFile {
  return {
    oldPath: 'src/a.ts',
    newPath: 'src/a.ts',
    status: 'modified',
    isBinary: false,
    additions: 2,
    deletions: 1,
    hunks: [
      {
        header: '@@ -1,2 +1,3 @@',
        lines: [
          { origin: ' ', content: 'const a = 1', oldLineno: 1, newLineno: 1 },
          { origin: '+', content: 'const b = 2', oldLineno: null, newLineno: 2 },
        ],
      },
    ],
    ...overrides,
  }
}

function renderPanel(overrides: Partial<GitDiffFile> = {}, fileContent?: string) {
  return render(
    <ChangeExplanationPanel
      repoPath="/Users/me/projects/demo"
      diffData={diffFile(overrides)}
      fileContent={fileContent}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  explanation.status = 'idle'
  explanation.error = null
  explanation.text = ''
  explanation.coverage = null
})

describe('ChangeExplanationPanel', () => {
  it('offers the action collapsed, with no body, until it is asked', () => {
    renderPanel()
    expect(screen.getByText('Explain the changes')).toBeInTheDocument()
    expect(screen.getByTestId('change-explanation-run')).toHaveTextContent('Explain')
    expect(screen.queryByTestId('change-explanation-body')).not.toBeInTheDocument()
  })

  it('sends the repo name, the file identity and the rebuilt patch to the feature', async () => {
    const user = userEvent.setup()
    renderPanel({}, 'const a = 1\nconst b = 2')
    await user.click(screen.getByTestId('change-explanation-run'))

    expect(explanation.explain).toHaveBeenCalledTimes(1)
    const request = explanation.explain.mock.calls[0][0]
    expect(request.repoName).toBe('demo')
    expect(request.file).toMatchObject({
      path: 'src/a.ts',
      status: 'modified',
      additions: 2,
      deletions: 1,
    })
    expect(request.file.patch).toContain('@@ -1,2 +1,3 @@')
    expect(request.file.patch).toContain('+const b = 2')
    expect(request.fileContent).toBe('const a = 1\nconst b = 2')
  })

  it('shows a progress body and a stop button while streaming', () => {
    explanation.status = 'streaming'
    renderPanel()
    expect(screen.getByTestId('change-explanation-body')).toHaveTextContent('Reading the change…')
    expect(screen.getByTestId('change-explanation-cancel')).toBeInTheDocument()
    expect(screen.queryByTestId('change-explanation-run')).not.toBeInTheDocument()
  })

  it('renders the streamed explanation as markdown', () => {
    explanation.status = 'done'
    explanation.text = '**Adds a second constant**'
    renderPanel()
    expect(screen.getByTestId('markdown')).toHaveTextContent('**Adds a second constant**')
    expect(screen.getByTestId('change-explanation-run')).toHaveTextContent('Regenerate')
  })

  it('translates a known provider failure instead of dumping the raw payload', () => {
    explanation.status = 'error'
    explanation.error = '{"code":"AI_PROVIDER_NOT_RUNNING","message":"AI_PROVIDER_NOT_RUNNING"}'
    renderPanel()
    const message = screen.getByTestId('change-explanation-error').textContent ?? ''
    expect(message).not.toContain('AI_PROVIDER_NOT_RUNNING')
    expect(message.length).toBeGreaterThan(0)
  })

  it('cancels the generation from the stop button', async () => {
    explanation.status = 'streaming'
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByTestId('change-explanation-cancel'))
    expect(explanation.cancel).toHaveBeenCalled()
  })

  it('drops a stale explanation when the viewer swaps in another file', () => {
    explanation.status = 'done'
    explanation.text = 'about a.ts'
    const { rerender } = renderPanel()
    explanation.reset.mockClear()

    rerender(
      <ChangeExplanationPanel
        repoPath="/Users/me/projects/demo"
        diffData={diffFile({ oldPath: 'src/b.ts', newPath: 'src/b.ts' })}
      />
    )
    expect(explanation.reset).toHaveBeenCalled()
  })
})

// This panel's coverage is unusual: the prompt carries two variable parts, and the one most often
// cut is the *file content* the explanation is supposed to be read against — not the patch.
describe('ChangeExplanationPanel — coverage', () => {
  it('reports the window a big file would have needed, under the answer', () => {
    explanation.text = 'It renames the handler.'
    explanation.coverage = {
      filesRead: 0,
      filesTotal: 1,
      complete: false,
      requiredContextTokens: 32768,
      windowTooSmall: false,
    }
    renderPanel()
    expect(screen.getByTestId('change-explanation-coverage')).toBeInTheDocument()
  })

  it('stays silent when the patch and the file both fit', () => {
    explanation.text = 'It renames the handler.'
    explanation.coverage = {
      filesRead: 1,
      filesTotal: 1,
      complete: true,
      requiredContextTokens: 8192,
      windowTooSmall: false,
    }
    renderPanel()
    expect(screen.queryByTestId('change-explanation-coverage')).not.toBeInTheDocument()
  })
})
