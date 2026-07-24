import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

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

const mockedDiscard = apiDiscardFileChanges as unknown as ReturnType<typeof vi.fn>
const mockedStage = apiStageFile as unknown as ReturnType<typeof vi.fn>
const mockedUnstage = apiUnstageFile as unknown as ReturnType<typeof vi.fn>

type ToolbarProps = {
  onCopyPath: () => void
  onClose: () => void
  onToggleStage: () => void
  onRollback: () => void
  onChangeActiveTab: (tab: 'diff' | 'file') => void
}

function toolbarProps() {
  return lastToolbarProps.current as ToolbarProps
}

function renderCenter(
  fileOverrides: Partial<{ path: string; staged: boolean; oid?: string }> = {},
  extra: Partial<React.ComponentProps<typeof DiffViewCenter>> = {}
) {
  const onClose = vi.fn()
  const onRefresh = vi.fn()
  const utils = render(
    <DiffViewCenter
      repoPath="/repo"
      file={{ path: 'src/a.ts', staged: false, ...fileOverrides }}
      onClose={onClose}
      onRefresh={onRefresh}
      {...extra}
    />
  )
  return { ...utils, onClose, onRefresh }
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  })
  vi.spyOn(window, 'alert').mockImplementation(() => {})
  vi.spyOn(window, 'confirm').mockReturnValue(true)
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
      data: { status: 'modified', oldPath: 'a.ts', newPath: 'a.ts', isBinary: false },
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
    expect((lastToolbarProps.current as any).hasPreview).toBe(true)

    act(() => (lastToolbarProps.current as any).onChangeActiveTab('preview'))
    expect(screen.getByTestId('file-preview-area')).toBeInTheDocument()
    expect(screen.queryByTestId('three-way-merge-editor')).not.toBeInTheDocument()
    expect(screen.queryByTestId('blame-file-viewer')).not.toBeInTheDocument()
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

  it('alerts on stage/unstage failure', async () => {
    mockedStage.mockRejectedValue(new Error('stage failed'))
    renderCenter({ staged: false })
    await act(async () => {
      await toolbarProps().onToggleStage()
    })
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('stage failed'))
  })
})

describe('DiffViewCenter — rollback', () => {
  it('discards file changes after confirmation, then closes and refreshes', async () => {
    mockedDiscard.mockResolvedValue(undefined)
    const { onClose, onRefresh } = renderCenter()
    await act(async () => {
      await toolbarProps().onRollback()
    })
    expect(window.confirm).toHaveBeenCalledWith('commitDetails.discardPrompt')
    expect(mockedDiscard).toHaveBeenCalledWith('/repo', 'src/a.ts')
    expect(onClose).toHaveBeenCalledOnce()
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('does nothing when the confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { onClose } = renderCenter()
    await act(async () => {
      await toolbarProps().onRollback()
    })
    expect(mockedDiscard).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('alerts on rollback failure', async () => {
    mockedDiscard.mockRejectedValue(new Error('discard failed'))
    renderCenter()
    await act(async () => {
      await toolbarProps().onRollback()
    })
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('discard failed'))
  })
})
