import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { GitGraphNode, GitDiff } from '@git-manager/git-types'

const { useCommitsMergedDiff, fileListCalls } = vi.hoisted(() => ({
  useCommitsMergedDiff: vi.fn(),
  fileListCalls: { current: [] as Record<string, unknown>[] },
}))
vi.mock('../../hooks/useCommitsMergedDiff', () => ({ useCommitsMergedDiff }))
vi.mock('./components/CommitDetailsAvatar', () => ({
  CommitDetailsAvatar: () => <div data-testid="avatar" />,
}))
vi.mock('./components/CommitFileList', () => ({
  CommitFileList: (props: Record<string, unknown>) => {
    fileListCalls.current.push(props)
    return <div data-testid="commit-file-list" />
  },
}))

import { MultiCommitDetailsPanel } from './MultiCommitDetailsPanel'

function node(oid: string, subject: string, timestamp = 1_700_000_000): GitGraphNode {
  return {
    commit: {
      oid,
      shortOid: oid.slice(0, 7),
      message: subject,
      subject,
      body: '',
      author: { name: 'Ada', email: 'ada@example.com', timestamp },
      committer: { name: 'Ada', email: 'ada@example.com', timestamp },
      parentOids: [],
    },
    column: 0,
    color: '#000',
    connections: [],
    refs: [],
  }
}

// Newest first, oldest last — the order the graph hands the panel.
const NODES = [node('newcommit0001', 'Newest change'), node('oldcommit0002', 'Oldest change')]

const DIFF: GitDiff = {
  files: [
    {
      newPath: 'src/a.ts',
      oldPath: 'src/a.ts',
      status: 'modified',
      additions: 3,
      deletions: 1,
      isBinary: false,
      hunks: [],
    },
  ],
  totalAdditions: 3,
  totalDeletions: 1,
}

beforeEach(() => {
  vi.clearAllMocks()
  fileListCalls.current = []
  useCommitsMergedDiff.mockReturnValue({ data: DIFF, isLoading: false })
})

describe('MultiCommitDetailsPanel', () => {
  it('shows the selection count and merged-diff subtitle', () => {
    render(<MultiCommitDetailsPanel nodes={NODES} repoPath="/repo" />)
    expect(screen.getByText('2 commits selected')).toBeInTheDocument()
    expect(screen.getByText('Viewing merged diff of 2 commits')).toBeInTheDocument()
  })

  it('fetches the merged diff spanning oldest→newest (baseOid = oldest, headOid = newest)', () => {
    render(<MultiCommitDetailsPanel nodes={NODES} repoPath="/repo" />)
    expect(useCommitsMergedDiff).toHaveBeenCalledWith('/repo', 'oldcommit0002', 'newcommit0001')
  })

  it('lists every selected commit with its subject and short oid', () => {
    render(<MultiCommitDetailsPanel nodes={NODES} repoPath="/repo" />)
    expect(screen.getByText('Newest change')).toBeInTheDocument()
    expect(screen.getByText('Oldest change')).toBeInTheDocument()
    expect(screen.getByText('newcomm')).toBeInTheDocument()
    expect(screen.getByText('oldcomm')).toBeInTheDocument()
  })

  it('renders the commit rows as passive, non-interactive items (no buttons)', () => {
    render(<MultiCommitDetailsPanel nodes={NODES} repoPath="/repo" />)
    const row = screen.getByTestId('multi-commit-row-oldcommit0002')
    expect(row.tagName).toBe('DIV')
    expect(row.closest('button')).toBeNull()
  })

  it('maps the merged diff files into the file list', () => {
    render(<MultiCommitDetailsPanel nodes={NODES} repoPath="/repo" />)
    expect(fileListCalls.current[0].processedFiles).toEqual([
      { path: 'src/a.ts', status: 'modified', additions: 3, deletions: 1, staged: false },
    ])
    // The file list is scoped to the newest commit; the base is injected on file selection.
    expect(fileListCalls.current[0].commitOid).toBe('newcommit0001')
  })

  it('injects the range base oid when a file diff is opened', () => {
    const onSelectFileDiff = vi.fn()
    render(
      <MultiCommitDetailsPanel
        nodes={NODES}
        repoPath="/repo"
        onSelectFileDiff={onSelectFileDiff}
      />
    )
    const onSelect = fileListCalls.current[0].onSelectFileDiff as (f: {
      path: string
      staged: boolean
      oid?: string
    }) => void
    onSelect({ path: 'src/a.ts', staged: false, oid: 'newcommit0001' })
    expect(onSelectFileDiff).toHaveBeenCalledWith({
      path: 'src/a.ts',
      staged: false,
      oid: 'newcommit0001',
      baseOid: 'oldcommit0002',
    })
  })

  it('shows a loading placeholder while the diff is pending', () => {
    useCommitsMergedDiff.mockReturnValue({ data: undefined, isLoading: true })
    render(<MultiCommitDetailsPanel nodes={NODES} repoPath="/repo" />)
    expect(screen.queryByTestId('commit-file-list')).not.toBeInTheDocument()
  })
})
