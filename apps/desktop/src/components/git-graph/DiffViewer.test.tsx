import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { GitDiffFile } from '@git-manager/git-types'
import { DiffViewer } from './DiffViewer'

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
  } as GitDiffFile
}

describe('DiffViewer — header', () => {
  it('shows the new path for a modified file', () => {
    render(<DiffViewer file={file({ status: 'modified' })} />)
    expect(screen.getByText('src/a.ts')).toBeInTheDocument()
    expect(screen.getByText("Modified")).toBeInTheDocument()
  })

  it('shows "old → new" for a renamed file', () => {
    render(<DiffViewer file={file({ status: 'renamed', oldPath: 'old.ts', newPath: 'new.ts' })} />)
    expect(screen.getByText('old.ts → new.ts')).toBeInTheDocument()
    expect(screen.getByText("Renamed")).toBeInTheDocument()
  })

  it.each([
    ['added', "Added"],
    ['deleted', "Deleted"],
    ['copied', "Copied"],
    ['typechange', "Typechange"],
  ] as const)('labels a %s file as "%s"', (status, label) => {
    render(<DiffViewer file={file({ status })} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('falls back to the raw status string for an unrecognized status', () => {
    render(<DiffViewer file={file({ status: 'weird' as GitDiffFile['status'] })} />)
    expect(screen.getByText('weird')).toBeInTheDocument()
  })

  it('shows the additions/deletions counts for a non-binary file', () => {
    render(<DiffViewer file={file({ additions: 5, deletions: 3 })} />)
    expect(screen.getByText('+5')).toBeInTheDocument()
    expect(screen.getByText('-3')).toBeInTheDocument()
  })
})

describe('DiffViewer — binary files', () => {
  it('shows a "Binary file" placeholder and hides counts/hunks', () => {
    render(<DiffViewer file={file({ isBinary: true })} />)
    expect(screen.getByText("Binary file")).toBeInTheDocument()
    expect(screen.queryByText('+2')).not.toBeInTheDocument()
    expect(screen.queryByText('unchanged')).not.toBeInTheDocument()
  })
})

describe('DiffViewer — hunks', () => {
  it('renders the hunk header and every line with its content', () => {
    render(<DiffViewer file={file()} />)
    expect(screen.getByText('@@ -1,3 +1,4 @@')).toBeInTheDocument()
    expect(screen.getByText('unchanged')).toBeInTheDocument()
    expect(screen.getByText('removed line')).toBeInTheDocument()
    expect(screen.getByText('added line')).toBeInTheDocument()
  })

  it('shows the old/new line numbers, blank when absent', () => {
    render(<DiffViewer file={file()} />)
    const addedLine = screen.getByText('added line').closest('div')!
    // newLineno is 2 for the added line, oldLineno is null (rendered as empty)
    expect(addedLine.textContent).toContain('2')
  })
})
