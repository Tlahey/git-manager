import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { forwardRef, useImperativeHandle } from 'react'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const { useFileDiff, useFileRawContents } = vi.hoisted(() => ({
  useFileDiff: vi.fn(),
  useFileRawContents: vi.fn(),
}))
vi.mock('../../hooks/useFileDiff', () => ({ useFileDiff }))
vi.mock('../../hooks/useFileRawContents', () => ({ useFileRawContents }))
vi.mock('../../api/git.api', () => ({
  apiDiscardFileChanges: vi.fn(),
  apiStageFile: vi.fn(),
  apiUnstageFile: vi.fn(),
}))

const { diffViewerMock, lastDiffViewerProps, lastToolbarProps } = vi.hoisted(() => ({
  diffViewerMock: { goToNextChange: vi.fn(), goToPreviousChange: vi.fn(), getModifiedValue: vi.fn(), setModifiedValue: vi.fn() },
  lastDiffViewerProps: { current: null as unknown },
  lastToolbarProps: { current: null as unknown },
}))
vi.mock('./MonacoDiffViewer', () => {
  const MonacoDiffViewer = forwardRef((props: unknown, ref) => {
    lastDiffViewerProps.current = props
    useImperativeHandle(ref, () => diffViewerMock)
    return <div data-testid="monaco-diff-viewer" />
  })
  MonacoDiffViewer.displayName = 'MonacoDiffViewer'
  return { MonacoDiffViewer }
})
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
  onPrevChange: () => void
  onNextChange: () => void
}

function toolbarProps() {
  return lastToolbarProps.current as ToolbarProps
}

function renderCenter(fileOverrides: Partial<{ path: string; staged: boolean; oid?: string }> = {}, extra: Partial<React.ComponentProps<typeof DiffViewCenter>> = {}) {
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
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true })
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

  it('shows a binary placeholder instead of the Monaco viewer for binary files', () => {
    useFileDiff.mockReturnValue({ data: { status: 'modified', oldPath: 'a.ts', newPath: 'a.ts', isBinary: true }, isLoading: false, refetch: vi.fn() })
    renderCenter()
    expect(screen.getByTestId('diff-binary-placeholder')).toBeInTheDocument()
    expect(screen.queryByTestId('monaco-diff-viewer')).not.toBeInTheDocument()
  })
})

describe('DiffViewCenter — Monaco wiring', () => {
  beforeEach(() => {
    useFileDiff.mockReturnValue({ data: { status: 'modified', oldPath: 'a.ts', newPath: 'a.ts', isBinary: false }, isLoading: false, refetch: vi.fn() })
    useFileRawContents.mockReturnValue({ data: { original: 'old content', modified: 'new content' }, isLoading: false })
  })

  it('passes the raw contents and file path through to MonacoDiffViewer', () => {
    renderCenter()
    expect(lastDiffViewerProps.current).toMatchObject({
      original: 'old content',
      modified: 'new content',
      filePath: 'src/a.ts',
      viewMode: 'split',
      activeTab: 'diff',
    })
  })

  it('proxies prev/next-change toolbar callbacks to the Monaco ref', () => {
    renderCenter()
    toolbarProps().onPrevChange()
    toolbarProps().onNextChange()
    expect(diffViewerMock.goToPreviousChange).toHaveBeenCalledOnce()
    expect(diffViewerMock.goToNextChange).toHaveBeenCalledOnce()
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
