import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { GitDiffFile } from '@git-manager/git-types'

vi.mock('@tanstack/react-virtual', async () =>
  (await import('../../../test/virtualizerMock')).virtualizerModule()
)

import { DiffFileList } from './DiffFileList'
import { DIFF_ROW_HEIGHTS } from './diffRows'
import { resetVirtualWindow, virtualWindow } from '../../../test/virtualizerMock'

function file(overrides: Partial<GitDiffFile> = {}): GitDiffFile {
  return {
    oldPath: 'src/a.ts',
    newPath: 'src/a.ts',
    status: 'modified',
    isBinary: false,
    additions: 2,
    deletions: 1,
    hunks: [
      {
        header: '@@ -1,3 +1,4 @@',
        lines: [
          { origin: ' ', oldLineno: 1, newLineno: 1, content: 'unchanged' },
          { origin: '-', oldLineno: 2, newLineno: null, content: 'removed line' },
          { origin: '+', oldLineno: null, newLineno: 2, content: 'added line' },
        ],
      },
    ],
    ...overrides,
  }
}

function hugeFile(lineCount: number): GitDiffFile {
  return file({
    newPath: 'src/huge.ts',
    oldPath: 'src/huge.ts',
    hunks: [
      {
        header: '@@ huge @@',
        lines: Array.from({ length: lineCount }, (_, i) => ({
          origin: '+' as const,
          oldLineno: null,
          newLineno: i + 1,
          content: `line ${i}`,
        })),
      },
    ],
  })
}

beforeEach(() => {
  resetVirtualWindow()
})

describe('DiffFileList — file header', () => {
  it('shows the new path and status for a modified file', () => {
    render(<DiffFileList files={[file({ status: 'modified' })]} emptyMessage="none" />)
    expect(screen.getByText('src/a.ts')).toBeInTheDocument()
    expect(screen.getByText('Modified')).toBeInTheDocument()
  })

  it('carries a testid keyed by the displayed path, for deterministic per-file lookups', () => {
    // The e2e suite looks this exact id up (compare-branches.steps.ts) — renaming it silently
    // breaks scenarios no unit test would catch.
    render(<DiffFileList files={[file({ newPath: 'src/a.ts' })]} emptyMessage="none" />)
    expect(screen.getByTestId('diff-viewer-file-src/a.ts')).toBeInTheDocument()
  })

  it('shows "old → new" for a renamed file', () => {
    render(
      <DiffFileList
        files={[file({ status: 'renamed', oldPath: 'old.ts', newPath: 'new.ts' })]}
        emptyMessage="none"
      />
    )
    expect(screen.getByText('old.ts → new.ts')).toBeInTheDocument()
    expect(screen.getByText('Renamed')).toBeInTheDocument()
  })

  it.each([
    ['added', 'Added'],
    ['deleted', 'Deleted'],
    ['copied', 'Copied'],
    ['typechange', 'Typechange'],
  ] as const)('labels a %s file as "%s"', (status, label) => {
    render(<DiffFileList files={[file({ status })]} emptyMessage="none" />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('falls back to the raw status string for an unrecognized status', () => {
    render(
      <DiffFileList
        files={[file({ status: 'weird' as GitDiffFile['status'] })]}
        emptyMessage="none"
      />
    )
    expect(screen.getByText('weird')).toBeInTheDocument()
  })

  it('shows the additions/deletions counts for a non-binary file', () => {
    render(<DiffFileList files={[file({ additions: 5, deletions: 3 })]} emptyMessage="none" />)
    expect(screen.getByText('+5')).toBeInTheDocument()
    expect(screen.getByText('-3')).toBeInTheDocument()
  })
})

describe('DiffFileList — binary files', () => {
  it('shows a "Binary file" placeholder and hides counts/hunks', () => {
    render(<DiffFileList files={[file({ isBinary: true, hunks: [] })]} emptyMessage="none" />)
    expect(screen.getByText('Binary file')).toBeInTheDocument()
    expect(screen.queryByText('+2')).not.toBeInTheDocument()
    expect(screen.queryByText('unchanged')).not.toBeInTheDocument()
  })
})

describe('DiffFileList — hunks', () => {
  it('renders the hunk header and every line with its content', () => {
    render(<DiffFileList files={[file()]} emptyMessage="none" />)
    expect(screen.getByText('@@ -1,3 +1,4 @@')).toBeInTheDocument()
    expect(screen.getByText('unchanged')).toBeInTheDocument()
    expect(screen.getByText('removed line')).toBeInTheDocument()
    expect(screen.getByText('added line')).toBeInTheDocument()
  })

  it('shows the old/new line numbers, blank when absent', () => {
    render(<DiffFileList files={[file()]} emptyMessage="none" />)
    const addedLine = screen.getByText('added line').closest('div')!
    // newLineno is 2 for the added line, oldLineno is null (rendered as empty)
    expect(addedLine.textContent).toContain('2')
  })

  it('renders every file of a multi-file diff', () => {
    render(
      <DiffFileList
        files={[file({ newPath: 'a.ts' }), file({ newPath: 'b.ts' })]}
        emptyMessage="none"
      />
    )
    expect(screen.getByText('a.ts')).toBeInTheDocument()
    expect(screen.getByText('b.ts')).toBeInTheDocument()
    expect(screen.queryByText('none')).not.toBeInTheDocument()
  })
})

describe('DiffFileList — empty', () => {
  it("renders the caller's empty message when there is no file", () => {
    render(<DiffFileList files={[]} emptyMessage="Nothing here" />)
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })
})

describe('DiffFileList — virtualization', () => {
  it('renders only the rows the virtualizer hands it, however large the diff', () => {
    // The regression this whole component exists for: the old renderer built ~6 DOM nodes per line
    // of every file up front, so a branch comparison of a few thousand lines froze the window.
    virtualWindow.start = 0
    virtualWindow.end = 29

    const { container } = render(<DiffFileList files={[hugeFile(50_000)]} emptyMessage="none" />)

    expect(screen.getByTestId('diff-file-list-window').children).toHaveLength(30)
    // Nowhere near one node per line — the point of the exercise.
    expect(container.querySelectorAll('div').length).toBeLessThan(200)

    expect(screen.getByText('line 0')).toBeInTheDocument()
    expect(screen.queryByText('line 40000')).not.toBeInTheDocument()
  })

  it('reserves the full scroll height even for the rows it did not render', () => {
    virtualWindow.start = 0
    virtualWindow.end = 5

    render(<DiffFileList files={[hugeFile(1_000)]} emptyMessage="none" />)

    const expected = DIFF_ROW_HEIGHTS.file + DIFF_ROW_HEIGHTS.hunk + 1_000 * DIFF_ROW_HEIGHTS.line
    expect(screen.getByTestId('diff-file-list-content')).toHaveStyle({ height: `${expected}px` })
  })

  it('leaves the window at the top when it starts at the first row', () => {
    virtualWindow.start = 0
    virtualWindow.end = 2

    render(<DiffFileList files={[file()]} emptyMessage="none" />)

    const window = screen.getByTestId('diff-file-list-window')
    expect(window.children).toHaveLength(3)
    expect(window.style.transform).toBe('translateY(0px)')
  })

  it('offsets the window to the first rendered row, so a mid-list window is not drawn at the top', () => {
    virtualWindow.start = 2
    virtualWindow.end = 3

    render(<DiffFileList files={[file()]} emptyMessage="none" />)

    const window = screen.getByTestId('diff-file-list-window')
    expect(window.children).toHaveLength(2)
    // Rows 0 and 1 are the file header and the hunk header; row 2 is the first diff line.
    const offset = DIFF_ROW_HEIGHTS.file + DIFF_ROW_HEIGHTS.hunk
    expect(window.style.transform).toBe(`translateY(${offset}px)`)
    expect(screen.getByText('unchanged')).toBeInTheDocument()
    expect(screen.queryByText('@@ -1,3 +1,4 @@')).not.toBeInTheDocument()
  })

  it('stretches every row to the full scrollable width, not just the viewport', () => {
    // Rows sit in a `w-max` window, so without `min-w-full` a line's background and the file box's
    // right border would stop at the viewport edge the moment the diff is scrolled sideways.
    render(<DiffFileList files={[file()]} emptyMessage="none" />)

    const window = screen.getByTestId('diff-file-list-window')
    expect(window.className).toContain('w-max')
    for (const row of Array.from(window.children)) {
      expect(row.className).toContain('min-w-full')
    }
  })
})
