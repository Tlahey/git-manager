import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitStatus } from '@git-manager/git-types'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
  }),
}))
vi.mock('../../../hooks/useTheme', () => ({ useTheme: vi.fn() }))
vi.mock('../../../hooks/useMonacoTheme', () => ({ useMonacoTheme: vi.fn() }))

const { useGitStatus } = vi.hoisted(() => ({ useGitStatus: vi.fn() }))
vi.mock('../../../hooks/useGitStatus', () => ({ useGitStatus }))

vi.mock('../../../api/git.api', () => ({
  apiCreateFixupCommit: vi.fn(),
  apiCheckFixupTarget: vi.fn(),
  apiGetCommitFileVsWorkdir: vi.fn(),
  apiPushBranch: vi.fn(),
}))

const { closeWindow, emitMock, webviewGetByLabel, WebviewWindowCtor } = vi.hoisted(() => ({
  closeWindow: vi.fn(),
  emitMock: vi.fn(),
  webviewGetByLabel: vi.fn(),
  WebviewWindowCtor: vi.fn(),
}))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ close: closeWindow }) }))
vi.mock('@tauri-apps/api/event', () => ({ emit: emitMock }))
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: Object.assign(
    function (this: unknown, ...args: unknown[]) {
      WebviewWindowCtor(...args)
    },
    { getByLabel: (...a: unknown[]) => webviewGetByLabel(...a) }
  ),
}))

const { lastMergeEditorProps, lastFileListProps } = vi.hoisted(() => ({
  lastMergeEditorProps: { current: null as Record<string, unknown> | null },
  lastFileListProps: { current: null as Record<string, unknown> | null },
}))
vi.mock('../../merge-editor/ThreeWayMergeEditor', () => ({
  ThreeWayMergeEditor: (props: Record<string, unknown>) => {
    lastMergeEditorProps.current = props
    return <div data-testid="three-way-merge-editor" />
  },
}))
vi.mock('../components/CommitFileList', () => ({
  CommitFileList: (props: Record<string, unknown>) => {
    lastFileListProps.current = props
    return <div data-testid="commit-file-list" />
  },
}))

import {
  apiCreateFixupCommit,
  apiCheckFixupTarget,
  apiGetCommitFileVsWorkdir,
  apiPushBranch,
} from '../../../api/git.api'
import { FixupCommitWindow } from './FixupCommitWindow'
import { queryClient } from '../../../lib/queryClient'

const mockedCreateFixup = apiCreateFixupCommit as unknown as ReturnType<typeof vi.fn>
const mockedCheckFixupTarget = apiCheckFixupTarget as unknown as ReturnType<typeof vi.fn>
const mockedGetDiff = apiGetCommitFileVsWorkdir as unknown as ReturnType<typeof vi.fn>
const mockedPushBranch = apiPushBranch as unknown as ReturnType<typeof vi.fn>

function gitStatus(overrides: Partial<GitStatus> = {}): GitStatus {
  return { staged: [], unstaged: [], untracked: [], conflicted: [], ...overrides }
}

function renderWindow(overrides: Partial<{ repoPath: string; targetOid: string; targetShortOid: string; targetSubject: string }> = {}) {
  return render(
    <FixupCommitWindow
      repoPath="/repo"
      targetOid="target123"
      targetShortOid="target1"
      targetSubject="Original commit subject"
      {...overrides}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  queryClient.clear()
  lastMergeEditorProps.current = null
  lastFileListProps.current = null
  useGitStatus.mockReturnValue({ data: gitStatus() })
  mockedGetDiff.mockResolvedValue({ original: 'old', modified: 'new' })
  mockedCheckFixupTarget.mockResolvedValue({ missingInTarget: [], touchedAfterTarget: [] })
})

describe('FixupCommitWindow — header and defaults', () => {
  it('shows the target commit banner and pre-fills the message as a fixup!', () => {
    renderWindow()
    expect(screen.getByText('target1')).toBeInTheDocument()
    expect(screen.getByText('Original commit subject')).toBeInTheDocument()
    expect(screen.getByTestId('fixup-commit-message')).toHaveValue('fixup! Original commit subject')
  })

  it('builds the processed file list from git status (staged/unstaged/untracked)', () => {
    useGitStatus.mockReturnValue({
      data: gitStatus({
        staged: [{ path: 'a.ts', status: 'modified' }],
        unstaged: [{ path: 'b.ts', status: 'modified' }],
        untracked: ['c.ts'],
      }),
    })
    renderWindow()
    expect(lastFileListProps.current!.processedFiles).toEqual([
      { path: 'a.ts', status: 'modified', staged: true },
      { path: 'b.ts', status: 'modified', staged: false },
      { path: 'c.ts', status: 'untracked', staged: false },
    ])
  })
})

describe('FixupCommitWindow — diff area', () => {
  it('fetches and shows the diff for the first file by default', async () => {
    useGitStatus.mockReturnValue({ data: gitStatus({ staged: [{ path: 'a.ts', status: 'modified' }] }) })
    renderWindow()
    await waitFor(() => expect(mockedGetDiff).toHaveBeenCalledWith('/repo', 'target123', 'a.ts'))
    await screen.findByTestId('three-way-merge-editor')
    expect(lastMergeEditorProps.current).toMatchObject({ filePath: 'a.ts', original: 'old', modified: 'new', isTwoWay: true })
  })

  it('switches the diffed file when a different one is selected in the file list', async () => {
    useGitStatus.mockReturnValue({
      data: gitStatus({ staged: [{ path: 'a.ts', status: 'modified' }, { path: 'b.ts', status: 'modified' }] }),
    })
    renderWindow()
    await waitFor(() => expect(mockedGetDiff).toHaveBeenCalledWith('/repo', 'target123', 'a.ts'))

    ;(lastFileListProps.current!.onSelectFileDiff as (f: { path: string }) => void)({ path: 'b.ts' })
    await waitFor(() => expect(mockedGetDiff).toHaveBeenCalledWith('/repo', 'target123', 'b.ts'))
  })

  it('shows a "no changes" message when there are no files at all', () => {
    renderWindow()
    expect(screen.getByText('gitTree.fixupDialog.noChanges')).toBeInTheDocument()
  })
})

describe('FixupCommitWindow — commit gating', () => {
  it('disables commit when nothing is staged', () => {
    renderWindow()
    expect(screen.getByTestId('fixup-commit-btn')).toBeDisabled()
  })

  it('disables commit when the message is cleared, even with staged files', async () => {
    useGitStatus.mockReturnValue({ data: gitStatus({ staged: [{ path: 'a.ts', status: 'modified' }] }) })
    const user = userEvent.setup()
    renderWindow()
    await user.clear(screen.getByTestId('fixup-commit-message'))
    expect(screen.getByTestId('fixup-commit-btn')).toBeDisabled()
  })

  it('enables commit once files are staged and the message is non-empty', () => {
    useGitStatus.mockReturnValue({ data: gitStatus({ staged: [{ path: 'a.ts', status: 'modified' }] }) })
    renderWindow()
    expect(screen.getByTestId('fixup-commit-btn')).toBeEnabled()
  })
})

describe('FixupCommitWindow — committing', () => {
  beforeEach(() => {
    useGitStatus.mockReturnValue({ data: gitStatus({ staged: [{ path: 'a.ts', status: 'modified' }] }) })
  })

  it('creates the fixup commit, opens the rebasing window, emits an event, and closes', async () => {
    mockedCreateFixup.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWindow()
    await user.click(screen.getByTestId('fixup-commit-btn'))

    await waitFor(() => expect(mockedCreateFixup).toHaveBeenCalledWith('/repo', 'target123', 'fixup! Original commit subject'))
    await waitFor(() => expect(WebviewWindowCtor).toHaveBeenCalledOnce())
    expect(emitMock).toHaveBeenCalledWith('fixup-committed', { repoPath: '/repo' })
    expect(closeWindow).toHaveBeenCalledOnce()
  })

  it('reuses an existing rebasing window instead of opening a new one', async () => {
    mockedCreateFixup.mockResolvedValue(undefined)
    const existing = { show: vi.fn().mockResolvedValue(undefined), setFocus: vi.fn().mockResolvedValue(undefined) }
    webviewGetByLabel.mockResolvedValue(existing)
    const user = userEvent.setup()
    renderWindow()
    await user.click(screen.getByTestId('fixup-commit-btn'))

    await waitFor(() => expect(existing.show).toHaveBeenCalledOnce())
    expect(existing.setFocus).toHaveBeenCalledOnce()
    expect(WebviewWindowCtor).not.toHaveBeenCalled()
  })

  it('commits and pushes via the split-button "commit & push" action, skipping the rebasing window', async () => {
    mockedCreateFixup.mockResolvedValue(undefined)
    mockedPushBranch.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWindow()
    await user.click(screen.getByTestId('fixup-commit-menu-btn'))
    await user.click(screen.getByText('gitTree.fixupDialog.commitAndPush'))

    await waitFor(() => expect(mockedPushBranch).toHaveBeenCalledWith('/repo'))
    expect(WebviewWindowCtor).not.toHaveBeenCalled()
    expect(closeWindow).toHaveBeenCalledOnce()
  })

  it('shows an inline error and does not close the window on failure', async () => {
    mockedCreateFixup.mockRejectedValue(new Error('fixup failed'))
    const user = userEvent.setup()
    renderWindow()
    await user.click(screen.getByTestId('fixup-commit-btn'))

    expect(await screen.findByText(/fixup failed/)).toBeInTheDocument()
    expect(closeWindow).not.toHaveBeenCalled()
  })

  it('closes the window via the cancel button without committing', async () => {
    const user = userEvent.setup()
    renderWindow()
    await user.click(screen.getByTestId('fixup-cancel'))
    expect(closeWindow).toHaveBeenCalledOnce()
    expect(mockedCreateFixup).not.toHaveBeenCalled()
  })
})

describe('FixupCommitWindow — conflict-risk banner', () => {
  it('does not check or show a banner when nothing is staged', () => {
    renderWindow()
    expect(mockedCheckFixupTarget).not.toHaveBeenCalled()
    expect(screen.queryByTestId('fixup-risk-banner')).not.toBeInTheDocument()
  })

  it('shows nothing when the check comes back clean', async () => {
    useGitStatus.mockReturnValue({ data: gitStatus({ staged: [{ path: 'a.ts', status: 'modified' }] }) })
    renderWindow()
    await waitFor(() => expect(mockedCheckFixupTarget).toHaveBeenCalledWith('/repo', 'target123'))
    expect(screen.queryByTestId('fixup-risk-banner')).not.toBeInTheDocument()
  })

  it('shows a destructive warning for a file missing from the target commit', async () => {
    useGitStatus.mockReturnValue({ data: gitStatus({ staged: [{ path: 'config.ts', status: 'modified' }] }) })
    mockedCheckFixupTarget.mockResolvedValue({ missingInTarget: ['config.ts'], touchedAfterTarget: [] })
    renderWindow()
    await screen.findByTestId('fixup-risk-missing')
    expect(screen.getByTestId('fixup-risk-missing')).toHaveTextContent('config.ts')
  })

  it('shows a soft warning listing the intervening commits for a file touched after the target', async () => {
    useGitStatus.mockReturnValue({ data: gitStatus({ staged: [{ path: 'greeting.ts', status: 'modified' }] }) })
    mockedCheckFixupTarget.mockResolvedValue({
      missingInTarget: [],
      touchedAfterTarget: [
        { path: 'greeting.ts', commits: [{ oid: 'abc123', shortOid: 'abc123', subject: 'fixup! feat: add greeting module' }] },
      ],
    })
    renderWindow()
    const row = await screen.findByTestId('fixup-risk-touched')
    expect(row).toHaveTextContent('greeting.ts')
    expect(row).toHaveTextContent('abc123')
  })

  it('re-checks when the staged file set changes', async () => {
    useGitStatus.mockReturnValue({ data: gitStatus({ staged: [{ path: 'a.ts', status: 'modified' }] }) })
    const { rerender } = renderWindow()
    await waitFor(() => expect(mockedCheckFixupTarget).toHaveBeenCalledTimes(1))

    useGitStatus.mockReturnValue({ data: gitStatus({ staged: [{ path: 'b.ts', status: 'modified' }] }) })
    rerender(
      <FixupCommitWindow repoPath="/repo" targetOid="target123" targetShortOid="target1" targetSubject="Original commit subject" />
    )
    await waitFor(() => expect(mockedCheckFixupTarget).toHaveBeenCalledTimes(2))
  })
})
