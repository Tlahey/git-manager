import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { Toaster } from '@git-manager/ui'

const { useFileDiff, useFileRawContents, useFileHistory } = vi.hoisted(() => ({
  useFileDiff: vi.fn(),
  useFileRawContents: vi.fn(),
  useFileHistory: vi.fn(),
}))
vi.mock('../../hooks/useFileDiff', () => ({ useFileDiff }))
vi.mock('../../hooks/useFileRawContents', () => ({ useFileRawContents }))
vi.mock('../../hooks/useFileHistory', () => ({ useFileHistory }))
// Commit-association hooks aren't under test here; keep them inert (no SWR/network).
vi.mock('../../hooks/useRepoGitHub', () => ({
  useRepoGitHub: () => ({ ownerRepo: null, token: null }),
}))
vi.mock('../../hooks/useCommitTag', () => ({ useCommitTag: () => null }))
vi.mock('../../hooks/useCommitPullRequest', () => ({ useCommitPullRequest: () => null }))
vi.mock('../../api/git.api', () => ({
  apiDiscardFileChanges: vi.fn(),
  apiStageFile: vi.fn(),
  apiUnstageFile: vi.fn(),
  apiGetCommitWebUrl: vi.fn(),
}))

const { lastMergeEditorProps, lastFileViewerProps, lastToolbarProps } = vi.hoisted(() => ({
  lastMergeEditorProps: { current: null as unknown },
  lastFileViewerProps: { current: null as unknown },
  lastToolbarProps: { current: null as unknown },
}))
vi.mock('../merge-editor/ThreeWayMergeEditor', () => ({
  ThreeWayMergeEditor: (props: Record<string, unknown>) => {
    lastMergeEditorProps.current = props
    return <div data-testid="three-way-merge-editor" />
  },
}))
vi.mock('./BlameFileViewer', () => ({
  BlameFileViewer: (props: Record<string, unknown>) => {
    lastFileViewerProps.current = props
    return <div data-testid="blame-file-viewer" />
  },
}))
vi.mock('./components/DiffToolbar', () => ({
  DiffToolbar: (props: Record<string, unknown>) => {
    lastToolbarProps.current = props
    return <div data-testid="diff-toolbar" />
  },
}))

import { DiffViewCenter } from './DiffViewCenter'
// Type-only: the module itself is mocked above, but the real props keep this harness honest.
import type { DiffToolbar as DiffToolbarComponent } from './components/DiffToolbar'

type ToolbarProps = ComponentProps<typeof DiffToolbarComponent>

function toolbarProps() {
  return lastToolbarProps.current as ToolbarProps
}

function renderCenter(
  fileOverrides: Partial<React.ComponentProps<typeof DiffViewCenter>['file']> = {},
  extra: Partial<React.ComponentProps<typeof DiffViewCenter>> = {}
) {
  const onClose = vi.fn()
  const utils = render(
    <>
      <DiffViewCenter
        repoPath="/repo"
        file={{ path: 'src/a.ts', staged: false, ...fileOverrides }}
        onClose={onClose}
        {...extra}
      />
      {/* The component reports failures through the shared toast queue, so the sink has to be
          mounted for those assertions to see anything. */}
      <Toaster />
    </>
  )
  return { ...utils, onClose }
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  })
  useFileDiff.mockReturnValue({ data: undefined, isLoading: false, refetch: vi.fn() })
  useFileRawContents.mockReturnValue({ data: undefined, isLoading: false })
  useFileHistory.mockReturnValue({ data: undefined })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DiffViewCenter — loading/empty states', () => {
  it('shows a loading indicator while diff metadata or raw contents load', () => {
    useFileDiff.mockReturnValue({ data: undefined, isLoading: true, refetch: vi.fn() })
    renderCenter()
    expect(screen.getByText('Loading diff…')).toBeInTheDocument()
  })

  it('shows a fallback when there is no diff data once loaded', () => {
    renderCenter()
    expect(screen.getByText('No difference data found.')).toBeInTheDocument()
  })

  it('explains an empty diff for an unmodified file rather than blaming missing data', () => {
    // `unmodified` is set by the file explorer, which opens files that have no pending change.
    renderCenter({ unmodified: true })
    expect(screen.getByTestId('diff-no-data')).toHaveTextContent(
      'This file has no uncommitted changes.'
    )
  })

  it('shows a binary placeholder instead of the diff editor for binary files', () => {
    useFileDiff.mockReturnValue({
      data: { status: 'modified', oldPath: 'a.ts', newPath: 'a.ts', isBinary: true },
      isLoading: false,
      refetch: vi.fn(),
    })
    renderCenter()
    expect(screen.getByTestId('diff-binary-placeholder')).toBeInTheDocument()
    expect(screen.queryByTestId('three-way-merge-editor')).not.toBeInTheDocument()
  })
})

describe('DiffViewCenter — diff/file wiring', () => {
  beforeEach(() => {
    useFileDiff.mockReturnValue({
      data: {
        status: 'modified',
        oldPath: 'a.ts',
        newPath: 'a.ts',
        isBinary: false,
        additions: 1,
        deletions: 0,
        hunks: [],
      },
      isLoading: false,
      refetch: vi.fn(),
    })
    useFileRawContents.mockReturnValue({
      data: { original: 'old content', modified: 'new content' },
      isLoading: false,
    })
  })

  it('passes the raw contents and file path through to ThreeWayMergeEditor in two-way mode', () => {
    renderCenter()
    expect(lastMergeEditorProps.current).toMatchObject({
      repoPath: '/repo',
      filePath: 'src/a.ts',
      original: 'old content',
      modified: 'new content',
      isTwoWay: true,
    })
    expect(screen.queryByTestId('blame-file-viewer')).not.toBeInTheDocument()
  })

  it('offers the AI explanation above a working-copy diff', () => {
    renderCenter()
    expect(screen.getByTestId('change-explanation-panel')).toBeInTheDocument()
  })

  it('does not offer it for a committed version, which already has a message', () => {
    renderCenter({ oid: 'abc1234' })
    expect(screen.queryByTestId('change-explanation-panel')).not.toBeInTheDocument()
  })

  it('does not offer it outside the diff tab', () => {
    renderCenter()
    act(() => toolbarProps().onChangeActiveTab('file'))
    expect(screen.queryByTestId('change-explanation-panel')).not.toBeInTheDocument()
  })

  it('switches to the blame File viewer when the "file" tab is selected', () => {
    renderCenter()
    act(() => toolbarProps().onChangeActiveTab('file'))
    expect(lastFileViewerProps.current).toMatchObject({
      content: 'new content',
      filePath: 'src/a.ts',
      repoPath: '/repo',
    })
    expect(screen.queryByTestId('three-way-merge-editor')).not.toBeInTheDocument()
  })

  it('passes hasPreview=true to DiffToolbar and renders preview area when "preview" tab is selected', () => {
    renderCenter({ path: 'README.md' })
    expect(toolbarProps().hasPreview).toBe(true)

    act(() => toolbarProps().onChangeActiveTab('preview'))
    expect(screen.getByTestId('file-preview-area')).toBeInTheDocument()
    expect(screen.queryByTestId('three-way-merge-editor')).not.toBeInTheDocument()
    expect(screen.queryByTestId('blame-file-viewer')).not.toBeInTheDocument()
  })

  it('offers a preview for an SVG without giving up its diff', () => {
    renderCenter({ path: 'docs/logo.svg' })
    expect(toolbarProps().hasPreview).toBe(true)
    // The toolbar no longer takes an `isImage` prop: Diff and File stay available for every file.
    expect(toolbarProps()).not.toHaveProperty('isImage')
  })

  it('falls back to a message when an image preview cannot be loaded off disk', () => {
    renderCenter({ path: 'logo.png' })
    act(() => toolbarProps().onChangeActiveTab('preview'))

    const image = screen.getByTestId('file-preview-image')
    expect(image).toHaveAttribute('alt', 'Preview of logo.png')

    act(() => {
      fireEvent.error(image)
    })

    expect(screen.queryByTestId('file-preview-image')).not.toBeInTheDocument()
    expect(screen.getByTestId('file-preview-image-error')).toBeInTheDocument()
  })
})

describe('DiffViewCenter — copy path', () => {
  it('copies the file path and flips "copied" back off after 1.5s', async () => {
    vi.useFakeTimers()
    renderCenter()
    await act(async () => {
      toolbarProps().onCopyPath()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('src/a.ts')
    expect((lastToolbarProps.current as { copied: boolean }).copied).toBe(true)

    await act(async () => vi.advanceTimersByTime(1500))
    expect((lastToolbarProps.current as { copied: boolean }).copied).toBe(false)
    vi.useRealTimers()
  })
})

describe('DiffViewCenter — actions', () => {
  it('offers no stage or discard action: the working-tree panel owns those', () => {
    // They used to live in the toolbar too, which made one file — whichever happened to be open —
    // actionable from two places while its neighbours were actionable from one.
    useFileDiff.mockReturnValue({
      data: {
        status: 'modified',
        oldPath: 'src/a.ts',
        newPath: 'src/a.ts',
        isBinary: false,
        additions: 1,
        deletions: 0,
        hunks: [],
      },
      isLoading: false,
      refetch: vi.fn(),
    })
    useFileRawContents.mockReturnValue({ data: { original: 'a', modified: 'b' }, isLoading: false })
    renderCenter({ staged: false })

    const props = toolbarProps() as unknown as Record<string, unknown>
    expect(props.onToggleStage).toBeUndefined()
    expect(props.onRollback).toBeUndefined()
  })
})

describe('DiffViewCenter — a file with no pending change', () => {
  const DIFF_DATA = {
    status: 'modified',
    oldPath: 'src/a.ts',
    newPath: 'src/a.ts',
    isBinary: false,
    additions: 1,
    deletions: 0,
    hunks: [],
  }

  function withHistory(oid: string) {
    useFileHistory.mockReturnValue({ data: [{ oid, shortOid: oid.slice(0, 7) }] })
    useFileDiff.mockReturnValue({ data: DIFF_DATA, isLoading: false, refetch: vi.fn() })
    useFileRawContents.mockReturnValue({
      data: { original: 'before', modified: 'after' },
      isLoading: false,
    })
  }

  it('diffs against the last commit that touched it instead of showing nothing', () => {
    // Its working copy *is* HEAD, so "the diff" can only mean the change that produced it.
    withHistory('abcdef1234567890')
    renderCenter({ unmodified: true })

    expect(useFileRawContents).toHaveBeenCalledWith(
      '/repo',
      'src/a.ts',
      false,
      'abcdef1234567890',
      undefined
    )
    expect(useFileDiff).toHaveBeenCalledWith(
      '/repo',
      'src/a.ts',
      false,
      'abcdef1234567890',
      undefined
    )
    expect(screen.getByTestId('three-way-merge-editor')).toBeInTheDocument()
  })

  it('says which commit it fell back to, rather than showing an unexplained diff', () => {
    withHistory('abcdef1234567890')
    renderCenter({ unmodified: true })
    expect(screen.getByTestId('diff-last-change-note')).toHaveTextContent('abcdef1')
  })

  it('leaves the History panel selection alone', () => {
    // Pinning the commit by writing to the shared `selectedHistoryOid` would hijack the panel and
    // leave a "Back to current" button that returns here — the fallback stays local on purpose.
    withHistory('abcdef1234567890')
    renderCenter({ unmodified: true })
    expect(screen.queryByTestId('diff-version-bar')).not.toBeInTheDocument()
  })

  it('still reports an untracked file with no history as having nothing to show', () => {
    useFileHistory.mockReturnValue({ data: [] })
    renderCenter({ unmodified: true })
    expect(screen.getByTestId('diff-no-data')).toHaveTextContent(
      'This file has no uncommitted changes.'
    )
  })

  it('does not fall back for a file that does have pending changes', () => {
    useFileHistory.mockReturnValue({ data: [{ oid: 'abcdef1234567890' }] })
    useFileDiff.mockReturnValue({ data: DIFF_DATA, isLoading: false, refetch: vi.fn() })
    useFileRawContents.mockReturnValue({ data: { original: '', modified: '' }, isLoading: false })
    renderCenter({ unmodified: false })

    expect(useFileDiff).toHaveBeenCalledWith('/repo', 'src/a.ts', false, undefined, undefined)
    expect(screen.queryByTestId('diff-last-change-note')).not.toBeInTheDocument()
  })
})

describe('DiffViewCenter — switching files', () => {
  it('keeps the editor mounted while the next file loads, instead of flashing a spinner', () => {
    // react-query holds the previous file's data (keepPreviousData), so `isLoading` stays false
    // and the Monaco panes survive the switch — tearing them down and rebuilding one per click is
    // the flicker this avoids.
    useFileDiff.mockReturnValue({
      data: {
        status: 'modified',
        oldPath: 'src/a.ts',
        newPath: 'src/a.ts',
        isBinary: false,
        additions: 1,
        deletions: 0,
        hunks: [],
      },
      isLoading: false,
      isPlaceholderData: true,
      refetch: vi.fn(),
    })
    useFileRawContents.mockReturnValue({
      data: { original: 'old', modified: 'new' },
      isLoading: false,
      isPlaceholderData: true,
    })

    renderCenter({ path: 'src/b.ts' })

    expect(screen.getByTestId('three-way-merge-editor')).toBeInTheDocument()
    expect(screen.queryByText('Loading diff…')).not.toBeInTheDocument()
    expect(screen.getByTestId('diff-content-area')).toHaveAttribute('data-stale', 'true')
  })

  it('marks the content settled once the new file has arrived', () => {
    useFileDiff.mockReturnValue({
      data: {
        status: 'modified',
        oldPath: 'src/b.ts',
        newPath: 'src/b.ts',
        isBinary: false,
        additions: 1,
        deletions: 0,
        hunks: [],
      },
      isLoading: false,
      isPlaceholderData: false,
      refetch: vi.fn(),
    })
    useFileRawContents.mockReturnValue({
      data: { original: 'old', modified: 'new' },
      isLoading: false,
      isPlaceholderData: false,
    })

    renderCenter({ path: 'src/b.ts' })
    expect(screen.getByTestId('diff-content-area')).not.toHaveAttribute('data-stale')
  })
})
