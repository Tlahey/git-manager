import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { GitStatus } from '@git-manager/git-types'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))

const { useConflictedFiles, useGitStatus, swrMutate } = vi.hoisted(() => ({
  useConflictedFiles: vi.fn(),
  useGitStatus: vi.fn(),
  swrMutate: vi.fn(),
}))
vi.mock('../../hooks/useConflictedFiles', () => ({ useConflictedFiles }))
vi.mock('../../hooks/useGitStatus', () => ({ useGitStatus }))
vi.mock('swr', () => ({ mutate: swrMutate }))
vi.mock('../../api/git.api', () => ({
  apiRebaseAbort: vi.fn(),
  apiRebaseContinue: vi.fn(),
  apiRebaseSkip: vi.fn(),
  apiGetRebaseState: vi.fn(),
}))

const { fileListCalls } = vi.hoisted(() => ({
  fileListCalls: { current: [] as Record<string, unknown>[] },
}))
vi.mock('./components/CommitFileList', () => ({
  CommitFileList: (props: Record<string, unknown>) => {
    fileListCalls.current.push(props)
    return <div data-testid="commit-file-list" data-commit-oid={String(props.commitOid)} />
  },
}))

import {
  apiRebaseAbort,
  apiRebaseContinue,
  apiRebaseSkip,
  apiGetRebaseState,
} from '../../api/git.api'
import { ConflictResolutionPanel } from './ConflictResolutionPanel'

const mockedAbort = apiRebaseAbort as unknown as ReturnType<typeof vi.fn>
const mockedContinue = apiRebaseContinue as unknown as ReturnType<typeof vi.fn>
const mockedSkip = apiRebaseSkip as unknown as ReturnType<typeof vi.fn>
const mockedGetRebaseState = apiGetRebaseState as unknown as ReturnType<typeof vi.fn>

function gitStatus(overrides: Partial<GitStatus> = {}): GitStatus {
  return { staged: [], unstaged: [], untracked: [], conflicted: [], ...overrides }
}

function findFileList(commitOid: 'CONFLICTED' | 'RESOLVED') {
  return fileListCalls.current.find((p) => p.commitOid === commitOid)!
}

function renderPanel(
  props: Partial<{
    activeFile: string | null
    onSelectFile: (p: string) => void
    onClose: () => void
  }> = {}
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onSelectFile = props.onSelectFile ?? vi.fn()
  const onClose = props.onClose ?? vi.fn()
  const utils = render(
    <QueryClientProvider client={client}>
      <ConflictResolutionPanel
        repoPath="/repo"
        activeFile={props.activeFile ?? null}
        onSelectFile={onSelectFile}
        onClose={onClose}
      />
    </QueryClientProvider>
  )
  return { ...utils, client, onSelectFile, onClose }
}

beforeEach(() => {
  vi.clearAllMocks()
  fileListCalls.current = []
  useConflictedFiles.mockReturnValue({ data: [] })
  useGitStatus.mockReturnValue({ data: gitStatus() })
  mockedGetRebaseState.mockResolvedValue({ currentOid: null, currentMessage: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ConflictResolutionPanel — header', () => {
  it('shows the step-progress badge only once currentStep/totalSteps are known', async () => {
    mockedGetRebaseState.mockResolvedValue({ currentStep: 2, totalSteps: 5 })
    renderPanel()
    expect(
      await screen.findByText('conflictEditor.stepProgress:{"current":2,"total":5}')
    ).toBeInTheDocument()
  })

  it('hides the step-progress badge when absent', () => {
    renderPanel()
    expect(screen.queryByText(/stepProgress/)).not.toBeInTheDocument()
  })

  it('calls onClose from the header close button', async () => {
    const user = userEvent.setup()
    const { onClose } = renderPanel()
    await user.click(screen.getByTestId('conflict-panel-close-button'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('ConflictResolutionPanel — file lists', () => {
  it('builds conflicted items from useConflictedFiles', () => {
    useConflictedFiles.mockReturnValue({ data: ['a.ts', 'b.ts'] })
    renderPanel()
    expect(findFileList('CONFLICTED').processedFiles).toEqual([
      { path: 'a.ts', status: 'modified', staged: false },
      { path: 'b.ts', status: 'modified', staged: false },
    ])
  })

  it('builds resolved items from staged git status, mapping unknown statuses to "modified"', () => {
    useGitStatus.mockReturnValue({
      data: gitStatus({
        staged: [
          { path: 'x.ts', status: 'deleted' },
          { path: 'y.ts', status: 'copied' },
        ],
      }),
    })
    renderPanel()
    expect(findFileList('RESOLVED').processedFiles).toEqual([
      { path: 'x.ts', status: 'deleted', staged: true },
      { path: 'y.ts', status: 'modified', staged: true },
    ])
  })

  it('routes conflicted-file selection to onSelectFile', () => {
    useConflictedFiles.mockReturnValue({ data: ['a.ts'] })
    const onSelectFile = vi.fn()
    renderPanel({ onSelectFile })
    ;(findFileList('CONFLICTED').onSelectFileDiff as (f: { path: string }) => void)({
      path: 'a.ts',
    })
    expect(onSelectFile).toHaveBeenCalledWith('a.ts')
  })
})

describe('ConflictResolutionPanel — message editing across polls', () => {
  it('initializes the message from the current rebase step', async () => {
    mockedGetRebaseState.mockResolvedValue({
      currentOid: 'step-a',
      currentMessage: '  fix: step a  ',
    })
    renderPanel()
    await waitFor(() =>
      expect(screen.getByPlaceholderText('commit.placeholder')).toHaveValue('fix: step a')
    )
  })

  it('preserves an in-progress edit across a poll that returns the same step', async () => {
    mockedGetRebaseState.mockResolvedValue({ currentOid: 'step-a', currentMessage: 'original' })
    const { client } = renderPanel()
    await waitFor(() =>
      expect(screen.getByPlaceholderText('commit.placeholder')).toHaveValue('original')
    )

    const user = userEvent.setup()
    await user.click(screen.getByTestId('conflict-amend-toggle'))
    await user.clear(screen.getByPlaceholderText('commit.placeholder'))
    await user.type(screen.getByPlaceholderText('commit.placeholder'), 'my edit')

    mockedGetRebaseState.mockResolvedValue({
      currentOid: 'step-a',
      currentMessage: 'original (refetched)',
    })
    await act(async () => {
      await client.refetchQueries({ queryKey: ['rebase-state', '/repo'] })
    })
    expect(screen.getByPlaceholderText('commit.placeholder')).toHaveValue('my edit')
  })

  it('resets the message once the rebase advances to a new step', async () => {
    mockedGetRebaseState.mockResolvedValue({ currentOid: 'step-a', currentMessage: 'original' })
    const { client } = renderPanel()
    await waitFor(() =>
      expect(screen.getByPlaceholderText('commit.placeholder')).toHaveValue('original')
    )

    const user = userEvent.setup()
    await user.click(screen.getByTestId('conflict-amend-toggle'))

    mockedGetRebaseState.mockResolvedValue({
      currentOid: 'step-b',
      currentMessage: 'next step message',
    })
    await act(async () => {
      await client.refetchQueries({ queryKey: ['rebase-state', '/repo'] })
    })
    await waitFor(() =>
      expect(screen.getByPlaceholderText('commit.placeholder')).toHaveValue('next step message')
    )
  })

  it('disables the message textarea unless "amend" is toggled on', async () => {
    const user = userEvent.setup()
    renderPanel()
    expect(screen.getByPlaceholderText('commit.placeholder')).toBeDisabled()
    await user.click(screen.getByTestId('conflict-amend-toggle'))
    expect(screen.getByPlaceholderText('commit.placeholder')).toBeEnabled()
  })
})

describe('ConflictResolutionPanel — action button visibility', () => {
  it('shows Skip when there are conflicts and nothing resolved yet', () => {
    useConflictedFiles.mockReturnValue({ data: ['a.ts'] })
    renderPanel()
    expect(screen.getByTestId('conflict-panel-skip-button')).toBeInTheDocument()
    expect(screen.queryByTestId('conflict-panel-continue-button')).not.toBeInTheDocument()
  })

  it('shows Continue once all conflicts are resolved', () => {
    useConflictedFiles.mockReturnValue({ data: [] })
    useGitStatus.mockReturnValue({
      data: gitStatus({ staged: [{ path: 'a.ts', status: 'modified' }] }),
    })
    renderPanel()
    expect(screen.getByTestId('conflict-panel-continue-button')).toBeInTheDocument()
    expect(screen.queryByTestId('conflict-panel-skip-button')).not.toBeInTheDocument()
  })

  it('always shows Abort', () => {
    renderPanel()
    expect(screen.getByTestId('conflict-panel-abort-button')).toBeInTheDocument()
  })
})

describe('ConflictResolutionPanel — actions', () => {
  it('aborts, closes the panel, and refreshes queries/SWR cache', async () => {
    mockedAbort.mockResolvedValue(undefined)
    const user = userEvent.setup()
    const { onClose } = renderPanel()
    await user.click(screen.getByTestId('conflict-panel-abort-button'))

    await waitFor(() => expect(mockedAbort).toHaveBeenCalledWith('/repo'))
    expect(onClose).toHaveBeenCalledOnce()
    expect(swrMutate).toHaveBeenCalledWith(['conflicted-files', '/repo'])
  })

  it('skips without closing the panel', async () => {
    mockedSkip.mockResolvedValue(undefined)
    useConflictedFiles.mockReturnValue({ data: ['a.ts'] })
    const user = userEvent.setup()
    const { onClose } = renderPanel()
    await user.click(screen.getByTestId('conflict-panel-skip-button'))

    await waitFor(() => expect(mockedSkip).toHaveBeenCalledWith('/repo'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('continues without an amended message when "amend" is off', async () => {
    mockedContinue.mockResolvedValue(undefined)
    const user = userEvent.setup()
    const { onClose } = renderPanel()
    await user.click(screen.getByTestId('conflict-panel-continue-button'))

    await waitFor(() => expect(mockedContinue).toHaveBeenCalledWith('/repo', undefined))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('continues with the edited message when "amend" is on', async () => {
    mockedContinue.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByTestId('conflict-amend-toggle'))
    await user.type(screen.getByPlaceholderText('commit.placeholder'), 'amended message')
    await user.click(screen.getByTestId('conflict-panel-continue-button'))

    await waitFor(() => expect(mockedContinue).toHaveBeenCalledWith('/repo', 'amended message'))
  })

  it('shows an inline error and does not close on abort failure', async () => {
    mockedAbort.mockRejectedValue(new Error('abort failed'))
    const user = userEvent.setup()
    const { onClose } = renderPanel()
    await user.click(screen.getByTestId('conflict-panel-abort-button'))

    expect(await screen.findByText(/abort failed/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('disables all three action buttons while one is in progress', async () => {
    mockedAbort.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByTestId('conflict-panel-abort-button'))
    expect(screen.getByTestId('conflict-panel-abort-button')).toBeDisabled()
    expect(screen.getByTestId('conflict-panel-continue-button')).toBeDisabled()
  })
})
