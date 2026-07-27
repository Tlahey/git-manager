import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { AiCommitScan, ScanCommit } from '@git-manager/ai'
import type { GitDiff } from '@git-manager/git-types'

const { listeners, listen } = vi.hoisted(() => {
  const listeners = new Map<string, Set<(e: { payload: unknown }) => void>>()
  const listen = vi.fn(async (event: string, handler: (e: { payload: unknown }) => void) => {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event)!.add(handler)
    return () => listeners.get(event)?.delete(handler)
  })
  return { listeners, listen }
})
vi.mock('@tauri-apps/api/event', () => ({ listen }))

vi.mock('../api/ai.api', () => ({
  apiGetAiCommitScan: vi.fn(),
  commitRelevanceService: { run: vi.fn() },
  commitSearchAnswerService: { run: vi.fn(), cancel: vi.fn() },
}))
vi.mock('../api/git.api', () => ({ apiGetCommitDiff: vi.fn() }))

import {
  apiGetAiCommitScan,
  commitRelevanceService,
  commitSearchAnswerService,
} from '../api/ai.api'
import { apiGetCommitDiff } from '../api/git.api'
import { useAiCommitSearch } from './useAiCommitSearch'
import { useAiCommitSearchStore } from '../stores/aiCommitSearch.store'

const mockedScan = apiGetAiCommitScan as unknown as ReturnType<typeof vi.fn>
const mockedJudge = commitRelevanceService.run as unknown as ReturnType<typeof vi.fn>
const mockedAnswer = commitSearchAnswerService.run as unknown as ReturnType<typeof vi.fn>
const mockedDiff = apiGetCommitDiff as unknown as ReturnType<typeof vi.fn>

/** The request id the hook minted for the answer in flight, read back off the mocked service. */
function currentRequestId(): string {
  return (mockedAnswer.mock.calls.at(-1)?.[2] as string) ?? 'no-run-started'
}

function emit(event: string, token?: string, requestId: string = currentRequestId()) {
  listeners.get(event)?.forEach((h) => h({ payload: { requestId, token } }))
}

function commit(overrides: Partial<ScanCommit> = {}): ScanCommit {
  return {
    oid: 'a'.repeat(40),
    shortOid: 'aaaaaaa',
    subject: 'feat(ui): loading state on Button',
    body: '',
    author: 'Ada',
    timestamp: 1_783_987_200,
    files: [{ path: 'packages/ui/src/Button.tsx', status: 'modified' }],
    filesTruncated: false,
    insertions: 3,
    deletions: 1,
    parentCount: 1,
    ...overrides,
  }
}

function scan(commits: ScanCommit[], overrides: Partial<AiCommitScan> = {}): AiCommitScan {
  return {
    repoName: 'demo',
    branch: 'main',
    commits,
    truncated: false,
    sinceEpoch: 1_781_395_200,
    ...overrides,
  }
}

const diff: GitDiff = {
  files: [
    {
      oldPath: 'packages/ui/src/Button.tsx',
      newPath: 'packages/ui/src/Button.tsx',
      status: 'modified',
      additions: 2,
      deletions: 1,
      isBinary: false,
      hunks: [
        {
          header: '@@ -1,2 +1,3 @@',
          lines: [{ origin: '+', content: 'const loading = true', oldLineno: null, newLineno: 2 }],
        },
      ],
    },
  ],
  totalAdditions: 2,
  totalDeletions: 1,
}

const options = { sinceHours: 720, maxCommits: 60 }

beforeEach(() => {
  vi.clearAllMocks()
  listeners.clear()
  useAiCommitSearchStore.setState({ runs: {} })
  mockedScan.mockResolvedValue(scan([commit()]))
  mockedDiff.mockResolvedValue(diff)
  mockedJudge.mockResolvedValue({
    relevant: true,
    finding: 'adds a loading state',
    files: ['packages/ui/src/Button.tsx'],
  })
  mockedAnswer.mockResolvedValue(undefined)
})

describe('useAiCommitSearch', () => {
  it('reads every commit in the window, one model call each', async () => {
    mockedScan.mockResolvedValue(
      scan([commit({ shortOid: 'c1' }), commit({ shortOid: 'c2', oid: 'b'.repeat(40) })])
    )
    const { result } = renderHook(() => useAiCommitSearch('/repo/demo'))

    await act(async () => {
      await result.current.search('Did the Button change?', options)
    })

    expect(mockedScan).toHaveBeenCalledWith('/repo/demo', 720, 60)
    expect(mockedJudge).toHaveBeenCalledTimes(2)
    expect(mockedDiff).toHaveBeenCalledTimes(2)
  })

  it('sends each commit its own patch text, not the whole window at once', async () => {
    const { result } = renderHook(() => useAiCommitSearch('/repo/demo'))
    await act(async () => {
      await result.current.search('Did the Button change?', options)
    })

    const input = mockedJudge.mock.calls[0][1]
    expect(input.question).toBe('Did the Button change?')
    expect(input.diff).toContain('diff --git a/packages/ui/src/Button.tsx')
    expect(input.commit.shortOid).toBe('aaaaaaa')
  })

  it('writes the answer from the relevant commits only', async () => {
    mockedScan.mockResolvedValue(
      scan([commit({ shortOid: 'hit' }), commit({ shortOid: 'miss', oid: 'b'.repeat(40) })])
    )
    mockedJudge
      .mockResolvedValueOnce({ relevant: true, finding: 'adds it', files: [] })
      .mockResolvedValueOnce({ relevant: false, finding: '', files: [] })

    const { result } = renderHook(() => useAiCommitSearch('/repo/demo'))
    await act(async () => {
      await result.current.search('Did the Button change?', options)
    })

    const input = mockedAnswer.mock.calls[0][1]
    expect(input.findings).toHaveLength(1)
    expect(input.findings[0].shortOid).toBe('hit')
    expect(input.scanned).toBe(2)
  })

  it('excludes an unreadable commit from the answer’s denominator', async () => {
    // A commit whose call failed said nothing; counting it as read would let a provider hiccup
    // strengthen a negative answer.
    mockedScan.mockResolvedValue(
      scan([commit({ shortOid: 'ok' }), commit({ shortOid: 'bad', oid: 'b'.repeat(40) })])
    )
    mockedJudge
      .mockResolvedValueOnce({ relevant: false, finding: '', files: [] })
      .mockRejectedValueOnce(new Error('provider down'))

    const { result } = renderHook(() => useAiCommitSearch('/repo/demo'))
    await act(async () => {
      await result.current.search('Did the Button change?', options)
    })

    expect(mockedAnswer.mock.calls[0][1].scanned).toBe(1)
    expect(result.current.failedCount).toBe(1)
  })

  it('carries the truncation flag through to the answer, so "not found" stays qualified', async () => {
    mockedScan.mockResolvedValue(scan([commit()], { truncated: true }))
    const { result } = renderHook(() => useAiCommitSearch('/repo/demo'))
    await act(async () => {
      await result.current.search('Did the Button change?', options)
    })

    expect(mockedAnswer.mock.calls[0][1].truncated).toBe(true)
    expect(result.current.truncated).toBe(true)
  })

  it('saves the finished run with its matches, so an old answer keeps its evidence', async () => {
    const { result } = renderHook(() => useAiCommitSearch('/repo/demo'))
    await act(async () => {
      await result.current.search('Did the Button change?', options)
    })
    await act(async () => {
      emit('ai:token', '**Yes.**')
      emit('ai:done')
    })

    const [stored] = useAiCommitSearchStore.getState().runs['/repo/demo']
    expect(stored).toMatchObject({
      question: 'Did the Button change?',
      answer: '**Yes.**',
      scanned: 1,
      failed: 0,
      truncated: false,
      sinceHours: 720,
    })
    expect(stored.matches[0]).toMatchObject({
      shortOid: 'aaaaaaa',
      finding: 'adds a loading state',
      files: ['packages/ui/src/Button.tsx'],
    })
  })

  it('publishes each verdict as it lands, so the panel fills in during the run', async () => {
    mockedScan.mockResolvedValue(
      scan([commit({ shortOid: 'c1' }), commit({ shortOid: 'c2', oid: 'b'.repeat(40) })])
    )
    const { result } = renderHook(() => useAiCommitSearch('/repo/demo'))
    await act(async () => {
      await result.current.search('Did the Button change?', options)
    })

    await waitFor(() => expect(result.current.results).toHaveLength(2))
    expect(result.current.matches).toHaveLength(2)
  })

  it('does nothing on a blank question', async () => {
    const { result } = renderHook(() => useAiCommitSearch('/repo/demo'))
    await act(async () => {
      await result.current.search('   ', options)
    })
    expect(mockedScan).not.toHaveBeenCalled()
  })

  it('reports a failure to list the commits without calling the model', async () => {
    mockedScan.mockRejectedValue(new Error('not a repository'))
    const { result } = renderHook(() => useAiCommitSearch('/repo/demo'))
    await act(async () => {
      await result.current.search('Did the Button change?', options)
    })

    expect(result.current.phase).toBe('error')
    expect(result.current.error).toContain('not a repository')
    expect(mockedJudge).not.toHaveBeenCalled()
  })

  it('stops the scan when cancelled, and says so rather than reporting an error', async () => {
    mockedScan.mockResolvedValue(
      scan([commit({ shortOid: 'c1' }), commit({ shortOid: 'c2', oid: 'b'.repeat(40) })])
    )
    // Cancel from inside the first judgement, so the loop sees it at the next commit boundary.
    const { result } = renderHook(() => useAiCommitSearch('/repo/demo'))
    mockedJudge.mockImplementation(async () => {
      await result.current.cancel()
      return { relevant: false, finding: '', files: [] }
    })

    await act(async () => {
      await result.current.search('Did the Button change?', options)
    })

    expect(result.current.phase).toBe('cancelled')
    expect(mockedJudge).toHaveBeenCalledTimes(1)
    expect(mockedAnswer).not.toHaveBeenCalled()
  })

  it('clears the visible run without touching the saved history', async () => {
    const { result } = renderHook(() => useAiCommitSearch('/repo/demo'))
    await act(async () => {
      await result.current.search('Did the Button change?', options)
    })
    await act(async () => {
      emit('ai:token', '**Yes.**')
      emit('ai:done')
    })

    act(() => result.current.clear())

    expect(result.current.answer).toBe('')
    expect(result.current.results).toEqual([])
    expect(useAiCommitSearchStore.getState().runs['/repo/demo']).toHaveLength(1)
  })

  it('serves the repository’s saved searches, newest first', async () => {
    const { result } = renderHook(() => useAiCommitSearch('/repo/demo'))
    await act(async () => {
      await result.current.search('First question?', options)
    })
    await act(async () => {
      emit('ai:token', 'one')
      emit('ai:done')
    })

    await waitFor(() => expect(result.current.history).toHaveLength(1))
    expect(result.current.history[0].question).toBe('First question?')
  })
})
