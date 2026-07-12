import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { GitCommit } from '@git-manager/git-types'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../../../api/git.api', () => ({ apiGetCommitDiff: vi.fn() }))

const { useFileRawContents } = vi.hoisted(() => ({ useFileRawContents: vi.fn() }))
vi.mock('../../../hooks/useFileRawContents', () => ({ useFileRawContents }))

const { lastFileListProps, lastMergeEditorProps } = vi.hoisted(() => ({
  lastFileListProps: { current: null as Record<string, unknown> | null },
  lastMergeEditorProps: { current: null as Record<string, unknown> | null },
}))
vi.mock('../../git-graph/components/CommitFileList', () => ({
  CommitFileList: (props: Record<string, unknown>) => {
    lastFileListProps.current = props
    return <div data-testid="commit-file-list" />
  },
}))
vi.mock('../../merge-editor/ThreeWayMergeEditor', () => ({
  ThreeWayMergeEditor: (props: Record<string, unknown>) => {
    lastMergeEditorProps.current = props
    return <div data-testid="three-way-merge-editor" />
  },
}))

import { apiGetCommitDiff } from '../../../api/git.api'
import { RebaseCommitDetails } from './RebaseCommitDetails'

const mockedGetCommitDiff = apiGetCommitDiff as unknown as ReturnType<typeof vi.fn>

function commit(overrides: Partial<GitCommit> = {}): GitCommit {
  return {
    oid: 'abcdef1234567890',
    shortOid: 'abcdef1',
    message: 'Subject\n\nBody',
    subject: 'Subject line',
    body: '',
    author: { name: 'Ada Lovelace', email: 'ada@example.com', timestamp: 1700000000 },
    committer: { name: 'Ada Lovelace', email: 'ada@example.com', timestamp: 1700000000 },
    parentOids: ['parent1234567890'],
    ...overrides,
  }
}

function renderDetails(props: Partial<{ repoPath: string; commit: GitCommit }> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RebaseCommitDetails repoPath="/repo" commit={commit()} {...props} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  lastFileListProps.current = null
  lastMergeEditorProps.current = null
  mockedGetCommitDiff.mockResolvedValue({ files: [] })
  useFileRawContents.mockReturnValue({ data: undefined, isLoading: false })
})

describe('RebaseCommitDetails — file list', () => {
  it('builds processed files from the commit diff', async () => {
    mockedGetCommitDiff.mockResolvedValue({
      files: [
        {
          newPath: 'a.ts',
          oldPath: 'a.ts',
          status: 'modified',
          additions: 2,
          deletions: 1,
          isBinary: false,
          hunks: [],
        },
      ],
    })
    renderDetails()
    await waitFor(() => expect(lastFileListProps.current).not.toBeNull())
    expect(lastFileListProps.current!.processedFiles).toEqual([
      { path: 'a.ts', status: 'modified', additions: 2, deletions: 1, staged: false },
    ])
  })

  it('selecting a file in the list drives the diff panel below', async () => {
    mockedGetCommitDiff.mockResolvedValue({
      files: [
        {
          newPath: 'a.ts',
          oldPath: 'a.ts',
          status: 'modified',
          additions: 1,
          deletions: 0,
          isBinary: false,
          hunks: [],
        },
        {
          newPath: 'b.ts',
          oldPath: 'b.ts',
          status: 'modified',
          additions: 1,
          deletions: 0,
          isBinary: false,
          hunks: [],
        },
      ],
    })
    useFileRawContents.mockReturnValue({
      data: { original: 'old', modified: 'new' },
      isLoading: false,
    })
    renderDetails()
    await waitFor(() =>
      expect(useFileRawContents).toHaveBeenCalledWith('/repo', 'a.ts', false, 'abcdef1234567890')
    )
    ;(lastFileListProps.current!.onSelectFileDiff as (f: { path: string }) => void)({
      path: 'b.ts',
    })
    await waitFor(() =>
      expect(useFileRawContents).toHaveBeenCalledWith('/repo', 'b.ts', false, 'abcdef1234567890')
    )
  })
})

describe('RebaseCommitDetails — diff panel', () => {
  it('shows a hint when no file is active yet', () => {
    renderDetails()
    expect(screen.getByText('rebaseEditor.selectFileHint')).toBeInTheDocument()
  })

  it('renders the two-way merge editor with parent/commit labels once a file has contents', async () => {
    mockedGetCommitDiff.mockResolvedValue({
      files: [
        {
          newPath: 'a.ts',
          oldPath: 'a.ts',
          status: 'modified',
          additions: 1,
          deletions: 0,
          isBinary: false,
          hunks: [],
        },
      ],
    })
    useFileRawContents.mockReturnValue({
      data: { original: 'old content', modified: 'new content' },
      isLoading: false,
    })
    renderDetails()
    await waitFor(() => expect(screen.getByTestId('three-way-merge-editor')).toBeInTheDocument())
    expect(lastMergeEditorProps.current).toMatchObject({
      filePath: 'a.ts',
      original: 'old content',
      modified: 'new content',
      isTwoWay: true,
    })
    // originalLabel/modifiedLabel are React nodes passed as props to the (stubbed)
    // ThreeWayMergeEditor — the stub doesn't render them, so render them directly to inspect.
    const { getByText: getByTextInLabels } = render(
      <>
        {lastMergeEditorProps.current!.originalLabel as React.ReactNode}
        {lastMergeEditorProps.current!.modifiedLabel as React.ReactNode}
      </>
    )
    expect(getByTextInLabels('parent1')).toBeInTheDocument()
    expect(getByTextInLabels('abcdef1')).toBeInTheDocument()
  })

  it('shows a "no parent" placeholder for a root commit', async () => {
    mockedGetCommitDiff.mockResolvedValue({
      files: [
        {
          newPath: 'a.ts',
          oldPath: 'a.ts',
          status: 'modified',
          additions: 1,
          deletions: 0,
          isBinary: false,
          hunks: [],
        },
      ],
    })
    useFileRawContents.mockReturnValue({
      data: { original: '', modified: 'new content' },
      isLoading: false,
    })
    renderDetails({ commit: commit({ parentOids: [] }) })
    await waitFor(() => expect(lastMergeEditorProps.current).not.toBeNull())
    const { getByText: getByTextInLabel } = render(
      lastMergeEditorProps.current!.originalLabel as React.ReactElement
    )
    expect(getByTextInLabel('rebaseEditor.noParent')).toBeInTheDocument()
  })
})

describe('RebaseCommitDetails — commit metadata', () => {
  it('shows the subject, body, author, date, and oid', () => {
    renderDetails({
      commit: commit({
        subject: 'Add a great feature',
        body: 'Some details',
        author: { name: 'Grace Hopper', email: 'grace@example.com', timestamp: 0 },
      }),
    })
    expect(screen.getByText('Add a great feature')).toBeInTheDocument()
    expect(screen.getByText('Some details')).toBeInTheDocument()
    expect(screen.getByText(/Grace Hopper/)).toBeInTheDocument()
    expect(screen.getByText(/grace@example.com/)).toBeInTheDocument()
  })

  it('hides the body paragraph when the commit has none', () => {
    renderDetails({ commit: commit({ body: '' }) })
    expect(screen.queryByText('Some details')).not.toBeInTheDocument()
  })
})
