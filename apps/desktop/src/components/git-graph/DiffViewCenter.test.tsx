import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { Toaster } from '@git-manager/ui'

const { useFileDiff, useFileRawContents } = vi.hoisted(() => ({
  useFileDiff: vi.fn(),
  useFileRawContents: vi.fn(),
}))
vi.mock('../../hooks/useFileDiff', () => ({ useFileDiff }))
vi.mock('../../hooks/useFileRawContents', () => ({ useFileRawContents }))
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

import { apiDiscardFileChanges, apiStageFile, apiUnstageFile } from '../../api/git.api'
import { DiffViewCenter } from './DiffViewCenter'
// Type-only: the module itself is mocked above, but the real props keep this harness honest.
import type { DiffToolbar as DiffToolbarComponent } from './components/DiffToolbar'

const mockedDiscard = apiDiscardFileChanges as unknown as ReturnType<typeof vi.fn>
const mockedStage = apiStageFile as unknown as ReturnType<typeof vi.fn>
const mockedUnstage = apiUnstageFile as unknown as ReturnType<typeof vi.fn>

type ToolbarProps = ComponentProps<typeof DiffToolbarComponent>

function toolbarProps() {
  return lastToolbarProps.current as ToolbarProps
}

function renderCenter(
  fileOverrides: Partial<React.ComponentProps<typeof DiffViewCenter>['file']> = {},
  extra: Partial<React.ComponentProps<typeof DiffViewCenter>> = {}
) {
  const onClose = vi.fn()
  const onRefresh = vi.fn()
  const utils = render(
    <>
      <DiffViewCenter
        repoPath="/repo"
        file={{ path: 'src/a.ts', staged: false, ...fileOverrides }}
        onClose={onClose}
        onRefresh={onRefresh}
        {...extra}
      />
      {/* The component reports failures through the shared toast queue, so the sink has to be
          mounted for those assertions to see anything. */}
      <Toaster />
    </>
  )
  return { ...utils, onClose, onRefresh }
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  })
  useFileDiff.mockReturnValue({ data: undefined, isLoading: false, refetch: vi.fn() })
  useFileRawContents.mockReturnValue({ data: undefined, isLoading: false })
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

describe('DiffViewCenter — stage toggle', () => {
  it('stages an unstaged file, refetches, and refreshes', async () => {
    const refetch = vi.fn()
    useFileDiff.mockReturnValue({ data: undefined, isLoading: false, refetch })
    mockedStage.mockResolvedValue(undefined)
    const { onRefresh } = renderCenter({ staged: false })
    await act(async () => {
      await toolbarProps().onToggleStage()
    })
    expect(mockedStage).toHaveBeenCalledWith('/repo', 'src/a.ts')
    expect(refetch).toHaveBeenCalledOnce()
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('unstages a staged file', async () => {
    mockedUnstage.mockResolvedValue(undefined)
    renderCenter({ staged: true })
    await act(async () => {
      await toolbarProps().onToggleStage()
    })
    expect(mockedUnstage).toHaveBeenCalledWith('/repo', 'src/a.ts')
  })

  it('surfaces a stage/unstage failure as an error toast', async () => {
    mockedStage.mockRejectedValue(new Error('stage failed'))
    renderCenter({ staged: false })
    await act(async () => {
      await toolbarProps().onToggleStage()
    })
    // Address the toast by its own text: the queue is a module-level singleton, so an earlier
    // test's toast can still be on screen and `getByTestId('toast')` would find two.
    expect(screen.getByText(/stage failed/).closest('[data-testid="toast"]')).toHaveAttribute(
      'data-variant',
      'error'
    )
  })
})

describe('DiffViewCenter — rollback', () => {
  /**
   * Opens the rollback confirmation and answers it. `onRollback` only settles once the user has
   * clicked, so it is deliberately not awaited before the click — awaiting it first would
   * deadlock on a dialog nobody has answered yet.
   */
  async function rollbackAnswering(answer: 'confirm' | 'cancel') {
    let pending: Promise<void> | undefined
    await act(async () => {
      pending = toolbarProps().onRollback() ?? undefined
    })
    expect(screen.getByTestId('rollback-file-confirm-dialog')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Are you sure you want to discard all local changes to this file? This action is irreversible.'
      )
    ).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByTestId(`confirm-dialog-${answer}`))
      await pending
    })
  }

  it('discards file changes after confirmation, then closes and refreshes', async () => {
    mockedDiscard.mockResolvedValue(undefined)
    const { onClose, onRefresh } = renderCenter()
    await rollbackAnswering('confirm')
    expect(mockedDiscard).toHaveBeenCalledWith('/repo', 'src/a.ts')
    expect(onClose).toHaveBeenCalledOnce()
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('does nothing when the confirmation is declined', async () => {
    const { onClose } = renderCenter()
    await rollbackAnswering('cancel')
    expect(mockedDiscard).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('surfaces a rollback failure as an error toast', async () => {
    mockedDiscard.mockRejectedValue(new Error('discard failed'))
    renderCenter()
    await rollbackAnswering('confirm')
    // Address the toast by its own text: the queue is a module-level singleton, so an earlier
    // test's toast can still be on screen and `getByTestId('toast')` would find two.
    expect(screen.getByText(/discard failed/).closest('[data-testid="toast"]')).toHaveAttribute(
      'data-variant',
      'error'
    )
  })
})
