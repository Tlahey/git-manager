import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { GitDiff } from '@git-manager/git-types'
import { DiffFilesPanel } from './DiffFilesPanel'

const file = (path: string) => ({
  oldPath: path,
  newPath: path,
  status: 'modified',
  isBinary: false,
  additions: 1,
  deletions: 0,
  hunks: [],
})

const diffOf = (...paths: string[]) =>
  ({
    files: paths.map(file),
    totalAdditions: paths.length,
    totalDeletions: 0,
  }) as unknown as GitDiff

describe('DiffFilesPanel', () => {
  it('shows a spinner instead of the list while loading', () => {
    render(<DiffFilesPanel diff={undefined} isLoading emptyMessage="Nothing here" />)
    expect(screen.getByTestId('diff-files-loading')).toBeInTheDocument()
    expect(screen.queryByText('Nothing here')).not.toBeInTheDocument()
  })

  it("renders the caller's empty message when the diff has no file", () => {
    render(<DiffFilesPanel diff={diffOf()} isLoading={false} emptyMessage="Nothing here" />)
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })

  it('renders one viewer per changed file', () => {
    render(<DiffFilesPanel diff={diffOf('a.ts', 'b.ts')} isLoading={false} emptyMessage="none" />)
    expect(screen.getByText('a.ts')).toBeInTheDocument()
    expect(screen.getByText('b.ts')).toBeInTheDocument()
    expect(screen.queryByText('none')).not.toBeInTheDocument()
  })

  it('treats a missing diff as empty rather than crashing', () => {
    render(<DiffFilesPanel diff={undefined} isLoading={false} emptyMessage="Nothing here" />)
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })
})
