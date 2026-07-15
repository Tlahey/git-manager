import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GhPrFile } from '../../../api/github.api'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const { usePrFileContentsMock } = vi.hoisted(() => ({ usePrFileContentsMock: vi.fn() }))
vi.mock('../../../hooks/usePrFileContents', () => ({ usePrFileContents: usePrFileContentsMock }))

// Monaco can't run in jsdom — stub the shared editors and assert they receive the right content.
vi.mock('../../merge-editor/ThreeWayMergeEditor', () => ({
  ThreeWayMergeEditor: (p: { original?: string; modified?: string }) => (
    <div data-testid="stub-diff-editor" data-original={p.original} data-modified={p.modified} />
  ),
}))
vi.mock('@git-manager/editor', () => ({
  CodeEditor: (p: { content: string }) => <div data-testid="stub-code-editor" data-content={p.content} />,
}))

import { PrFileDiffCenter } from './PrFileDiffCenter'

function file(overrides: Partial<GhPrFile> = {}): GhPrFile {
  return { filename: 'src/a.ts', status: 'modified', additions: 3, deletions: 1, changes: 4, ...overrides }
}

function contents(overrides: Partial<ReturnType<typeof usePrFileContentsMock>> = {}) {
  return {
    file: file(),
    original: 'old content',
    modified: 'new content',
    isBinary: false,
    isLoading: false,
    ...overrides,
  }
}

beforeEach(() => vi.clearAllMocks())

function renderCenter(onClose = vi.fn()) {
  return render(
    <PrFileDiffCenter repoPath="/repo" prNumber={7} filename="src/a.ts" onClose={onClose} />
  )
}

describe('PrFileDiffCenter', () => {
  it('shows the Monaco diff of the two versions by default', () => {
    usePrFileContentsMock.mockReturnValue(contents())
    renderCenter()
    const editor = screen.getByTestId('stub-diff-editor')
    expect(editor).toHaveAttribute('data-original', 'old content')
    expect(editor).toHaveAttribute('data-modified', 'new content')
    expect(screen.getByText('+3')).toBeInTheDocument()
  })

  it('toggles to the file view (read-only content)', async () => {
    usePrFileContentsMock.mockReturnValue(contents())
    const user = userEvent.setup()
    renderCenter()
    await user.click(screen.getByTestId('pr-file-diff-tab-file'))
    expect(screen.queryByTestId('stub-diff-editor')).not.toBeInTheDocument()
    expect(screen.getByTestId('stub-code-editor')).toHaveAttribute('data-content', 'new content')
  })

  it('calls onClose from the back button', async () => {
    usePrFileContentsMock.mockReturnValue(contents())
    const onClose = vi.fn()
    renderCenter(onClose)
    await userEvent.setup().click(screen.getByTestId('pr-file-diff-back'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows a binary placeholder instead of the editor', () => {
    usePrFileContentsMock.mockReturnValue(contents({ isBinary: true }))
    renderCenter()
    expect(screen.getByTestId('pr-file-diff-binary')).toBeInTheDocument()
    expect(screen.queryByTestId('stub-diff-editor')).not.toBeInTheDocument()
  })

  it('shows a spinner while loading and a not-found message for a missing file', () => {
    usePrFileContentsMock.mockReturnValue(contents({ isLoading: true }))
    const { rerender } = renderCenter()
    expect(screen.queryByTestId('stub-diff-editor')).not.toBeInTheDocument()

    usePrFileContentsMock.mockReturnValue(contents({ file: undefined, isLoading: false }))
    rerender(<PrFileDiffCenter repoPath="/repo" prNumber={7} filename="gone.ts" onClose={vi.fn()} />)
    expect(screen.getByText('pr.diff.notFound')).toBeInTheDocument()
  })
})
