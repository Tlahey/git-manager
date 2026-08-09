import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { GitCommit, GitGraphNode, GitRef, GitStatus } from '@git-manager/git-types'
import type { ProcessedFileItem } from '../components/common/CommitFileList'

const fetchQuery = vi.fn()
const invalidateQueries = vi.fn()
const getQueryData = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ fetchQuery, invalidateQueries, getQueryData }),
}))
vi.mock('swr', () => ({ mutate: vi.fn() }))

vi.mock('../api/git.api', () => ({
  apiUnstageAll: vi.fn(),
  apiStageFile: vi.fn(),
  apiStageFileQuietly: vi.fn(),
  apiUnstageFileQuietly: vi.fn(),
  apiUnstageAllQuietly: vi.fn(),
  apiCreateCommit: vi.fn(),
  apiGetPendingOperation: vi.fn(),
  apiStashPush: vi.fn(),
}))

// The hook reports failures through the shared toaster; only `toast` is imported from the package.
const { toastError, toastWarning } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastWarning: vi.fn(),
}))
vi.mock('@git-manager/ui', () => ({
  toast: { error: toastError, warning: toastWarning, success: vi.fn() },
}))

const { runLlmGenerate, cancelLlmGenerate, llmStatus } = vi.hoisted(() => ({
  runLlmGenerate: vi.fn(),
  cancelLlmGenerate: vi.fn(),
  llmStatus: { current: 'idle' },
}))
vi.mock('./useAiGeneration', () => ({
  useAiGeneration: () => ({
    generate: runLlmGenerate,
    cancel: cancelLlmGenerate,
    status: llmStatus.current,
  }),
}))

import {
  apiUnstageAll,
  apiStageFile,
  apiStageFileQuietly,
  apiUnstageFileQuietly,
  apiUnstageAllQuietly,
  apiCreateCommit,
  apiGetPendingOperation,
  apiStashPush,
} from '../api/git.api'
import { useWipCommitPanel } from './useWipCommitPanel'

const mocked = {
  apiUnstageAll: apiUnstageAll as unknown as ReturnType<typeof vi.fn>,
  apiStageFile: apiStageFile as unknown as ReturnType<typeof vi.fn>,
  apiStageFileQuietly: apiStageFileQuietly as unknown as ReturnType<typeof vi.fn>,
  apiUnstageFileQuietly: apiUnstageFileQuietly as unknown as ReturnType<typeof vi.fn>,
  apiUnstageAllQuietly: apiUnstageAllQuietly as unknown as ReturnType<typeof vi.fn>,
  apiCreateCommit: apiCreateCommit as unknown as ReturnType<typeof vi.fn>,
  apiGetPendingOperation: apiGetPendingOperation as unknown as ReturnType<typeof vi.fn>,
  apiStashPush: apiStashPush as unknown as ReturnType<typeof vi.fn>,
}

const t = (key: string) => key

function file(path: string, overrides: Partial<ProcessedFileItem> = {}): ProcessedFileItem {
  return { path, status: 'modified', staged: false, ...overrides }
}

function status(overrides: Partial<GitStatus> = {}): GitStatus {
  return { staged: [], unstaged: [], untracked: [], conflicted: [], ...overrides }
}

/** A graph node carrying just what `handleToggleAmend` reads off the cached `git-log` query. */
function node(commit: Partial<GitCommit>, refs: Partial<GitRef>[] = []): GitGraphNode {
  return { commit: { oid: 'head', ...commit }, refs } as GitGraphNode
}

beforeEach(() => {
  vi.clearAllMocks()
  llmStatus.current = 'idle'
  fetchQuery.mockResolvedValue(status())
  getQueryData.mockReturnValue(undefined)
  mocked.apiGetPendingOperation.mockResolvedValue(null)
})


describe('useWipCommitPanel — wipBatches grouping', () => {
  it('groups files by their top-level folder', () => {
    const files = [file('src/a.ts'), file('src/b.ts'), file('lib/c.ts')]
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), files, t))
    expect(Object.keys(result.current.wipBatches).sort()).toEqual(['lib', 'src'])
    expect(result.current.wipBatches.src).toHaveLength(2)
  })

  it('groups root-level files under "root"', () => {
    const files = [file('README.md')]
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), files, t))
    expect(result.current.wipBatches.root).toEqual([files[0]])
  })
})

describe('useWipCommitPanel — classic commit', () => {
  it('does nothing when the commit message is blank', async () => {
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), [], t))
    await act(async () => result.current.handleCommitWip())
    expect(mocked.apiCreateCommit).not.toHaveBeenCalled()
  })

  it('commits the message, clears it, and refreshes', async () => {
    mocked.apiCreateCommit.mockResolvedValue({ oid: 'new' })
    const onRefresh = vi.fn()
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), [], t, onRefresh))
    act(() => result.current.setCommitMessage('Add feature'))
    await act(async () => result.current.handleCommitWip())

    // The two trailing `undefined`s are `amendOid` and `skipHooks`: hooks run unless the user
    // deliberately asks for them not to, and that default is worth pinning.
    expect(mocked.apiCreateCommit).toHaveBeenCalledWith(
      '/repo',
      'Add feature',
      false,
      undefined,
      undefined
    )
    expect(result.current.commitMessage).toBe('')
    expect(result.current.isCommitting).toBe(false)
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('commits with amend: true when isAmend is true', async () => {
    mocked.apiCreateCommit.mockResolvedValue({ oid: 'amended' })
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), [], t))
    act(() => {
      result.current.setIsAmend(true)
      result.current.setCommitMessage('Amended commit msg')
    })
    await act(async () => result.current.handleCommitWip())

    expect(mocked.apiCreateCommit).toHaveBeenCalledWith(
      '/repo',
      'Amended commit msg',
      true,
      undefined,
      undefined
    )
    expect(result.current.isAmend).toBe(false)
  })

  it('prefills the empty message with the HEAD commit when amend is switched on', () => {
    getQueryData.mockReturnValue({
      nodes: [
        node({ message: 'WIP', oid: 'WIP' }),
        node({ message: 'feat: previous commit\n\nbody', subject: 'feat: previous commit' }, [
          { type: 'HEAD' },
        ]),
      ],
    })
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), [], t))
    act(() => result.current.handleToggleAmend(true))

    expect(result.current.isAmend).toBe(true)
    expect(result.current.commitMessage).toBe('feat: previous commit\n\nbody')
  })

  it('falls back to the subject when the HEAD commit has no full message', () => {
    getQueryData.mockReturnValue({
      nodes: [node({ message: '', subject: 'feat: subject only' }, [{ type: 'HEAD' }])],
    })
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), [], t))
    act(() => result.current.handleToggleAmend(true))

    expect(result.current.commitMessage).toBe('feat: subject only')
  })

  it('leaves a message the user already typed untouched when amend is switched on', () => {
    getQueryData.mockReturnValue({
      nodes: [node({ message: 'feat: previous commit' }, [{ type: 'HEAD' }])],
    })
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), [], t))
    act(() => result.current.setCommitMessage('my own message'))
    act(() => result.current.handleToggleAmend(true))

    expect(result.current.commitMessage).toBe('my own message')
  })

  it('pushes a stash and refreshes on handleStash', async () => {
    mocked.apiStashPush.mockResolvedValue({ oid: 'stash1' })
    const onRefresh = vi.fn()
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), [], t, onRefresh))
    act(() => {
      result.current.setStashMessage('my stash message')
      result.current.setIncludeUntracked(true)
    })
    await act(async () => result.current.handleStash())

    expect(mocked.apiStashPush).toHaveBeenCalledWith('/repo', 'my stash message', true)
    expect(result.current.stashMessage).toBe('')
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('reports a failure without clearing the message', async () => {
    mocked.apiCreateCommit.mockRejectedValue(new Error('commit failed'))
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), [], t))
    act(() => result.current.setCommitMessage('Add feature'))
    await act(async () => result.current.handleCommitWip())

    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('commit failed'))
    expect(result.current.commitMessage).toBe('Add feature')
    expect(result.current.isCommitting).toBe(false)
  })

  it('still commits during a merge — that is how a merge is finished', async () => {
    mocked.apiGetPendingOperation.mockResolvedValue('merge')
    mocked.apiCreateCommit.mockResolvedValue({ oid: 'new' })
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), [], t))
    act(() => result.current.setCommitMessage('merge branch feature'))
    await act(async () => result.current.handleCommitWip())

    // Unlike the batch flows, the ordinary button does not refuse: `create_commit` reads MERGE_HEAD
    // and produces a real merge commit, so blocking here would break the normal workflow.
    expect(mocked.apiCreateCommit).toHaveBeenCalledWith(
      '/repo',
      'merge branch feature',
      false,
      undefined,
      undefined
    )
    expect(toastWarning).not.toHaveBeenCalled()
  })

  it('handleGenerateCommitMessage writes the finished message into commitMessage', () => {
    // One callback, one whole message: the feature answers with grammar-constrained JSON now, so
    // there is no token stream to accumulate (see COMMIT_MESSAGE_SCHEMA).
    runLlmGenerate.mockImplementation(async (onMessage: (m: string) => void) => {
      onMessage('Hello world')
    })
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), [], t))
    act(() => result.current.handleGenerateCommitMessage())
    expect(result.current.commitMessage).toBe('Hello world')
  })

  it('handleGenerateCommitMessage cancels an in-flight generation instead of starting a new one', () => {
    llmStatus.current = 'generating'
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), [], t))
    act(() => result.current.handleGenerateCommitMessage())
    expect(cancelLlmGenerate).toHaveBeenCalledOnce()
    expect(runLlmGenerate).not.toHaveBeenCalled()
  })
})

describe('useWipCommitPanel — batch mode: generateMessageForBatch', () => {
  it('is a no-op when already generating for that group', async () => {
    mocked.apiUnstageAllQuietly.mockResolvedValue(undefined)
    const files = [file('src/a.ts')]
    const { result, rerender } = renderHook(({ gs }) => useWipCommitPanel('/repo', gs, files, t), {
      initialProps: { gs: status() },
    })
    // Simulate an in-progress generation by directly triggering it without awaiting, then
    // calling again synchronously while the first is still "in flight".
    runLlmGenerate.mockImplementation(() => new Promise(() => {})) // never resolves
    act(() => {
      result.current.generateMessageForBatch('src', files)
    })
    rerender({ gs: status() })
    mocked.apiUnstageAllQuietly.mockClear()
    act(() => {
      result.current.generateMessageForBatch('src', files)
    })
    // Second call should bail before touching staging again.
    expect(mocked.apiUnstageAllQuietly).not.toHaveBeenCalled()
  })

  // Through the `*Quietly` wrappers throughout: this index is a scratchpad, and the user asked for
  // a commit message rather than for a staging change (see `api/git/git-commit.api.ts`).
  it('stages non-deleted files and unstages deleted ones, then generates via the LLM', async () => {
    mocked.apiUnstageAllQuietly.mockResolvedValue(undefined)
    mocked.apiStageFileQuietly.mockResolvedValue(undefined)
    mocked.apiUnstageFileQuietly.mockResolvedValue(undefined)
    runLlmGenerate.mockImplementation(async (onMessage: (m: string) => void) => {
      onMessage('generated message')
    })
    fetchQuery.mockResolvedValue(status({ unstaged: [], untracked: [] }))

    const files = [
      file('src/a.ts', { status: 'modified' }),
      file('src/b.ts', { status: 'deleted' }),
    ]
    const { result } = renderHook(() =>
      useWipCommitPanel('/repo', status({ staged: [] }), files, t)
    )

    await act(async () => result.current.generateMessageForBatch('src', files))

    expect(mocked.apiStageFileQuietly).toHaveBeenCalledWith('/repo', 'src/a.ts')
    expect(mocked.apiUnstageFileQuietly).toHaveBeenCalledWith('/repo', 'src/b.ts')
    // ...and never through the announcing versions, which would credit the reward engine with a
    // stage/unstage the user never performed.
    expect(mocked.apiStageFile).not.toHaveBeenCalled()
    expect(mocked.apiUnstageAll).not.toHaveBeenCalled()
    expect(result.current.batchMessages.src).toBe('generated message')
    expect(result.current.batchGenerating.src).toBe(false)
  })

  it('restores originally-staged files still present after generation', async () => {
    mocked.apiUnstageAllQuietly.mockResolvedValue(undefined)
    mocked.apiStageFileQuietly.mockResolvedValue(undefined)
    runLlmGenerate.mockImplementation(async (onMessage: (m: string) => void) => onMessage('msg'))
    fetchQuery.mockResolvedValue(
      status({ unstaged: [{ path: 'other.ts', status: 'modified' } as never], untracked: [] })
    )

    const files = [file('src/a.ts')]
    const gitStatus = status({ staged: [{ path: 'other.ts', status: 'modified' } as never] })
    const { result } = renderHook(() => useWipCommitPanel('/repo', gitStatus, files, t))

    await act(async () => result.current.generateMessageForBatch('src', files))

    expect(mocked.apiStageFileQuietly).toHaveBeenCalledWith('/repo', 'other.ts')
  })

  it('records an error message and clears the generating flag on failure', async () => {
    mocked.apiUnstageAllQuietly.mockResolvedValue(undefined)
    mocked.apiStageFileQuietly.mockResolvedValue(undefined)
    runLlmGenerate.mockRejectedValue(new Error('ai provider down'))

    const files = [file('src/a.ts')]
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), files, t))
    await act(async () => result.current.generateMessageForBatch('src', files))

    expect(result.current.batchMessages.src).toContain('ai provider down')
    expect(result.current.batchGenerating.src).toBe(false)
  })
})

describe('useWipCommitPanel — batch mode: commitBatch', () => {
  it('reports and does nothing when the batch message is empty', async () => {
    const files = [file('src/a.ts')]
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), files, t))
    await act(async () => result.current.commitBatch('src', files))
    expect(toastError).toHaveBeenCalledWith('commit.emptyMessage')
    expect(mocked.apiCreateCommit).not.toHaveBeenCalled()
  })

  it('refuses to commit a group while another git operation is under way', async () => {
    mocked.apiGetPendingOperation.mockResolvedValue('rebase')
    const files = [file('src/a.ts')]
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), files, t))
    act(() => result.current.setBatchMessages({ src: 'feat: a' }))
    await act(async () => result.current.commitBatch('src', files))

    expect(toastWarning).toHaveBeenCalledWith('commitDetails.pendingOperation')
    // The index is left untouched: unstaging during a paused rebase discards the resolution.
    expect(mocked.apiUnstageAll).not.toHaveBeenCalled()
    expect(mocked.apiCreateCommit).not.toHaveBeenCalled()
  })

  it('stages the batch, commits, clears the message, and restores the rest', async () => {
    mocked.apiUnstageAll.mockResolvedValue(undefined)
    mocked.apiStageFile.mockResolvedValue(undefined)
    mocked.apiCreateCommit.mockResolvedValue({ oid: 'new' })
    fetchQuery.mockResolvedValue(
      status({ unstaged: [{ path: 'other.ts', status: 'modified' } as never], untracked: [] })
    )

    const files = [file('src/a.ts')]
    const gitStatus = status({ staged: [{ path: 'other.ts', status: 'modified' } as never] })
    const onRefresh = vi.fn()
    const { result } = renderHook(() => useWipCommitPanel('/repo', gitStatus, files, t, onRefresh))

    act(() => {
      result.current.setBatchMessages({ src: 'Batch commit message' })
    })
    await act(async () => result.current.commitBatch('src', files))

    expect(mocked.apiStageFile).toHaveBeenCalledWith('/repo', 'src/a.ts')
    expect(mocked.apiCreateCommit).toHaveBeenCalledWith('/repo', 'Batch commit message')
    expect(result.current.batchMessages.src).toBeUndefined()
    expect(mocked.apiStageFile).toHaveBeenCalledWith('/repo', 'other.ts')
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('reports a failure', async () => {
    mocked.apiUnstageAll.mockResolvedValue(undefined)
    mocked.apiStageFile.mockResolvedValue(undefined)
    mocked.apiCreateCommit.mockRejectedValue(new Error('commit failed'))

    const files = [file('src/a.ts')]
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), files, t))
    act(() => result.current.setBatchMessages({ src: 'Batch commit message' }))
    await act(async () => result.current.commitBatch('src', files))

    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('commit failed'))
  })
})

describe('useWipCommitPanel — batch "all" sequences', () => {
  const twoGroups = [file('src/a.ts'), file('lib/b.ts')]

  /** Drives `runLlmGenerate` the way a real generation does: one callback, carrying the whole
   * message, which is what replaces the group's "generating" placeholder. */
  function generatesMessage(text = 'feat: generated') {
    runLlmGenerate.mockImplementation(async (onMessage: (m: string) => void) => {
      onMessage(text)
    })
  }

  it('generates a message for every group, one after another', async () => {
    generatesMessage()
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), twoGroups, t))

    await act(async () => {
      await result.current.generateAllBatchMessages()
    })

    expect(runLlmGenerate).toHaveBeenCalledTimes(2)
    expect(result.current.batchMessages).toMatchObject({
      src: 'feat: generated',
      lib: 'feat: generated',
    })
  })

  it('never runs two generations at once — each one re-stages the index', async () => {
    // The invariant behind the sequencing: `generateMessageForBatch` unstages everything and stages
    // only its own group, so an overlapping run would be reading the other's staging.
    let inFlight = 0
    let overlapped = false
    runLlmGenerate.mockImplementation(async (onMessage: (m: string) => void) => {
      inFlight += 1
      if (inFlight > 1) overlapped = true
      await Promise.resolve()
      inFlight -= 1
      onMessage('feat: x')
    })
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), twoGroups, t))

    await act(async () => {
      await result.current.generateAllBatchMessages()
    })

    expect(overlapped).toBe(false)
  })

  it('keeps the groups that succeeded when one fails', async () => {
    // A run can take a minute; discarding the messages already produced because the last group
    // failed would be the wrong trade.
    let call = 0
    runLlmGenerate.mockImplementation(async (onMessage: (m: string) => void) => {
      call += 1
      if (call === 1) throw new Error('provider down')
      onMessage('feat: second')
    })
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), twoGroups, t))

    await act(async () => {
      await result.current.generateAllBatchMessages()
    })

    expect(runLlmGenerate).toHaveBeenCalledTimes(2)
    expect(result.current.batchMessages.lib).toBe('feat: second')
    expect(result.current.batchMessages.src).toContain('Error')
    expect(result.current.isGeneratingAllBatches).toBe(false)
  })

  it('commits only the groups that carry a message', async () => {
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), twoGroups, t))
    act(() => {
      result.current.setBatchMessages({ src: 'feat: only this one', lib: '   ' })
    })

    await act(async () => {
      await result.current.commitAllBatches()
    })

    expect(mocked.apiCreateCommit).toHaveBeenCalledTimes(1)
    expect(mocked.apiCreateCommit).toHaveBeenCalledWith('/repo', 'feat: only this one')
  })

  it('does nothing when no group has a message', async () => {
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), twoGroups, t))
    await act(async () => {
      await result.current.commitAllBatches()
    })
    expect(mocked.apiCreateCommit).not.toHaveBeenCalled()
    expect(mocked.apiUnstageAll).not.toHaveBeenCalled()
  })

  it('stops before the loop on a pending operation, warning once rather than per group', async () => {
    mocked.apiGetPendingOperation.mockResolvedValue('merge')
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), twoGroups, t))
    act(() => {
      result.current.setBatchMessages({ src: 'feat: a', lib: 'feat: b' })
    })

    await act(async () => {
      await result.current.commitAllBatches()
    })

    expect(toastWarning).toHaveBeenCalledTimes(1)
    expect(toastWarning).toHaveBeenCalledWith('commitDetails.pendingOperation')
    expect(mocked.apiCreateCommit).not.toHaveBeenCalled()
    expect(mocked.apiUnstageAll).not.toHaveBeenCalled()
  })

  it('clears its busy flag even when a commit throws', async () => {
    mocked.apiCreateCommit.mockRejectedValue(new Error('index locked'))
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), twoGroups, t))
    act(() => {
      result.current.setBatchMessages({ src: 'feat: a' })
    })

    await act(async () => {
      await result.current.commitAllBatches()
    })

    expect(result.current.isCommittingAllBatches).toBe(false)
  })
})

describe('useWipCommitPanel — skipping hooks', () => {
  it('passes the no-verify flag through when asked', async () => {
    mocked.apiCreateCommit.mockResolvedValue({ oid: 'new' })
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), [], t))

    act(() => result.current.setCommitMessage('chore: bypass'))
    await act(async () => result.current.handleCommitWip({ skipHooks: true }))

    expect(mocked.apiCreateCommit).toHaveBeenCalledWith(
      '/repo',
      'chore: bypass',
      false,
      undefined,
      true
    )
  })
})
