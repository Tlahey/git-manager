import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { GitStatus } from '@git-manager/git-types'
import type { ProcessedFileItem } from '../components/git-graph/components/CommitFileList'

const fetchQuery = vi.fn()
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ fetchQuery }) }))

vi.mock('../api/git.api', () => ({
  apiUnstageAll: vi.fn(),
  apiStageFile: vi.fn(),
  apiUnstageFile: vi.fn(),
  apiCreateCommit: vi.fn(),
}))

const { runLlmGenerate, cancelLlmGenerate, llmStatus, addMessage } = vi.hoisted(() => ({
  runLlmGenerate: vi.fn(),
  cancelLlmGenerate: vi.fn(),
  llmStatus: { current: 'idle' as string },
  addMessage: vi.fn(),
}))
vi.mock('./useAiGeneration', () => ({
  useAiGeneration: () => ({
    generate: runLlmGenerate,
    cancel: cancelLlmGenerate,
    status: llmStatus.current,
  }),
}))
vi.mock('./useCommitMessageHistory', () => ({
  useCommitMessageHistory: () => ({ history: ['past message'], addMessage }),
}))

import { apiUnstageAll, apiStageFile, apiUnstageFile, apiCreateCommit } from '../api/git.api'
import { useWipCommitPanel } from './useWipCommitPanel'

const mocked = {
  apiUnstageAll: apiUnstageAll as unknown as ReturnType<typeof vi.fn>,
  apiStageFile: apiStageFile as unknown as ReturnType<typeof vi.fn>,
  apiUnstageFile: apiUnstageFile as unknown as ReturnType<typeof vi.fn>,
  apiCreateCommit: apiCreateCommit as unknown as ReturnType<typeof vi.fn>,
}

const t = (key: string) => key

function file(path: string, overrides: Partial<ProcessedFileItem> = {}): ProcessedFileItem {
  return { path, status: 'modified', staged: false, ...overrides }
}

function status(overrides: Partial<GitStatus> = {}): GitStatus {
  return { staged: [], unstaged: [], untracked: [], conflicted: [], ...overrides } as GitStatus
}

beforeEach(() => {
  vi.clearAllMocks()
  llmStatus.current = 'idle'
  fetchQuery.mockResolvedValue(status())
})

afterEach(() => {
  vi.restoreAllMocks()
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

    expect(mocked.apiCreateCommit).toHaveBeenCalledWith('/repo', 'Add feature')
    expect(result.current.commitMessage).toBe('')
    expect(result.current.isCommitting).toBe(false)
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('alerts on failure without clearing the message', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    mocked.apiCreateCommit.mockRejectedValue(new Error('commit failed'))
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), [], t))
    act(() => result.current.setCommitMessage('Add feature'))
    await act(async () => result.current.handleCommitWip())

    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('commit failed'))
    expect(result.current.commitMessage).toBe('Add feature')
    expect(result.current.isCommitting).toBe(false)
  })

  it('handleGenerateCommitMessage streams tokens into commitMessage and records history on completion', () => {
    runLlmGenerate.mockImplementation(
      async (onToken: (t: string) => void, onDone: (full: string) => void) => {
        onToken('Hello ')
        onToken('world')
        onDone('Hello world')
      }
    )
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), [], t))
    act(() => result.current.handleGenerateCommitMessage())
    expect(result.current.commitMessage).toBe('Hello world')
    expect(addMessage).toHaveBeenCalledWith('Hello world')
  })

  it('handleGenerateCommitMessage cancels an in-flight generation instead of starting a new one', () => {
    llmStatus.current = 'streaming'
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), [], t))
    act(() => result.current.handleGenerateCommitMessage())
    expect(cancelLlmGenerate).toHaveBeenCalledOnce()
    expect(runLlmGenerate).not.toHaveBeenCalled()
  })

  it('exposes commit message history from useCommitMessageHistory', () => {
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), [], t))
    expect(result.current.history).toEqual(['past message'])
  })
})

describe('useWipCommitPanel — batch mode: generateMessageForBatch', () => {
  it('is a no-op when already generating for that group', async () => {
    mocked.apiUnstageAll.mockResolvedValue(undefined)
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
    mocked.apiUnstageAll.mockClear()
    act(() => {
      result.current.generateMessageForBatch('src', files)
    })
    // Second call should bail before touching staging again.
    expect(mocked.apiUnstageAll).not.toHaveBeenCalled()
  })

  it('stages non-deleted files and unstages deleted ones, then generates via the LLM', async () => {
    mocked.apiUnstageAll.mockResolvedValue(undefined)
    mocked.apiStageFile.mockResolvedValue(undefined)
    mocked.apiUnstageFile.mockResolvedValue(undefined)
    runLlmGenerate.mockImplementation(
      async (onToken: (t: string) => void, onDone: (full: string) => void) => {
        // onDone's `full` param is only used for the history entry (addMessage) — batchMessages is
        // driven exclusively by the running onToken accumulation, so the two must agree here to
        // reflect realistic streaming (where "full" is just the sum of the tokens already emitted).
        onToken('generated message')
        onDone('generated message')
      }
    )
    fetchQuery.mockResolvedValue(status({ unstaged: [], untracked: [] }))

    const files = [
      file('src/a.ts', { status: 'modified' }),
      file('src/b.ts', { status: 'deleted' }),
    ]
    const { result } = renderHook(() =>
      useWipCommitPanel('/repo', status({ staged: [] }), files, t)
    )

    await act(async () => result.current.generateMessageForBatch('src', files))

    expect(mocked.apiStageFile).toHaveBeenCalledWith('/repo', 'src/a.ts')
    expect(mocked.apiUnstageFile).toHaveBeenCalledWith('/repo', 'src/b.ts')
    expect(result.current.batchMessages.src).toBe('generated message')
    expect(result.current.batchGenerating.src).toBe(false)
    expect(addMessage).toHaveBeenCalledWith('generated message')
  })

  it('restores originally-staged files still present after generation', async () => {
    mocked.apiUnstageAll.mockResolvedValue(undefined)
    mocked.apiStageFile.mockResolvedValue(undefined)
    runLlmGenerate.mockImplementation(async (_onToken: unknown, onDone: (full: string) => void) =>
      onDone('msg')
    )
    fetchQuery.mockResolvedValue(
      status({ unstaged: [{ path: 'other.ts', status: 'modified' } as never], untracked: [] })
    )

    const files = [file('src/a.ts')]
    const gitStatus = status({ staged: [{ path: 'other.ts', status: 'modified' } as never] })
    const { result } = renderHook(() => useWipCommitPanel('/repo', gitStatus, files, t))

    await act(async () => result.current.generateMessageForBatch('src', files))

    expect(mocked.apiStageFile).toHaveBeenCalledWith('/repo', 'other.ts')
  })

  it('records an error message and clears the generating flag on failure', async () => {
    mocked.apiUnstageAll.mockResolvedValue(undefined)
    mocked.apiStageFile.mockResolvedValue(undefined)
    runLlmGenerate.mockRejectedValue(new Error('ai provider down'))

    const files = [file('src/a.ts')]
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), files, t))
    await act(async () => result.current.generateMessageForBatch('src', files))

    expect(result.current.batchMessages.src).toContain('ai provider down')
    expect(result.current.batchGenerating.src).toBe(false)
  })
})

describe('useWipCommitPanel — batch mode: commitBatch', () => {
  it('alerts and does nothing when the batch message is empty', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const files = [file('src/a.ts')]
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), files, t))
    await act(async () => result.current.commitBatch('src', files))
    expect(alertSpy).toHaveBeenCalledWith('commit.emptyMessage')
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

  it('alerts on failure', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    mocked.apiUnstageAll.mockResolvedValue(undefined)
    mocked.apiStageFile.mockResolvedValue(undefined)
    mocked.apiCreateCommit.mockRejectedValue(new Error('commit failed'))

    const files = [file('src/a.ts')]
    const { result } = renderHook(() => useWipCommitPanel('/repo', status(), files, t))
    act(() => result.current.setBatchMessages({ src: 'Batch commit message' }))
    await act(async () => result.current.commitBatch('src', files))

    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('commit failed'))
  })
})
