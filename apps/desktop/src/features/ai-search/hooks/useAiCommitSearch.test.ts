import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { CommitVerdictUnreadable, type AiCommitScan, type ScanCommit } from '@git-manager/ai'
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

vi.mock('../../../api/ai.api', () => ({
  apiGetAiCommitScan: vi.fn(),
  commitFileScanService: { run: vi.fn(), cancel: vi.fn() },
  commitQuickScanService: { run: vi.fn(), cancel: vi.fn() },
  commitRelevanceService: { run: vi.fn(), cancel: vi.fn() },
  commitSearchAnswerService: { run: vi.fn(), cancel: vi.fn() },
}))
vi.mock('../../../api/git.api', () => ({ apiGetCommitDiff: vi.fn() }))

import {
  apiGetAiCommitScan,
  commitFileScanService,
  commitQuickScanService,
  commitRelevanceService,
  commitSearchAnswerService,
} from '../../../api/ai.api'
import { apiGetCommitDiff } from '../../../api/git.api'
import { useAiCommitSearch } from './useAiCommitSearch'
import { useAiCommitSearchStore } from '../stores/aiCommitSearch.store'

const mockedScan = apiGetAiCommitScan as unknown as ReturnType<typeof vi.fn>
const mockedJudge = commitRelevanceService.run as unknown as ReturnType<typeof vi.fn>
const mockedAnswer = commitSearchAnswerService.run as unknown as ReturnType<typeof vi.fn>
const mockedDiff = apiGetCommitDiff as unknown as ReturnType<typeof vi.fn>
const mockedQuick = commitQuickScanService.run as unknown as ReturnType<typeof vi.fn>
const mockedFileScan = commitFileScanService.run as unknown as ReturnType<typeof vi.fn>
const mockedJudgeCancel = commitRelevanceService.cancel as unknown as ReturnType<typeof vi.fn>
const mockedQuickCancel = commitQuickScanService.cancel as unknown as ReturnType<typeof vi.fn>

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
    oldestEpoch: 1_781_395_200,
    newestEpoch: 1_783_987_200,
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

const options = { maxCommits: 60, mode: 'deep' as const }

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
  mockedQuick.mockResolvedValue([])
  // By default the file narrowing keeps everything, so tests that do not care about it see the
  // whole commit read — the deep mode's behaviour.
  mockedFileScan.mockImplementation((_c, input: { files: { path: string }[] }) =>
    Promise.resolve(input.files.map((f) => f.path))
  )
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

    expect(mockedScan).toHaveBeenCalledWith('/repo/demo', 60)
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
    expect(result.current.unread).toHaveLength(1)
    expect(result.current.unread[0].commit.shortOid).toBe('bad')
  })

  /** The panel can only name the cause if the run keeps it; a count alone was unactionable. */
  it('records why a run went unread, on the saved run too', async () => {
    mockedScan.mockResolvedValue(scan([commit()]))
    mockedJudge.mockRejectedValue(new CommitVerdictUnreadable('answered in prose'))

    const { result } = renderHook(() => useAiCommitSearch('/repo/demo'))
    await act(async () => {
      await result.current.search('Did the Button change?', options)
    })
    await act(async () => {
      emit('ai:token', 'No.')
      emit('ai:done')
    })

    expect(result.current.unread[0].failure).toBe('unreadable')
    const [stored] = useAiCommitSearchStore.getState().runs['/repo/demo']
    expect(stored).toMatchObject({ failed: 1, failureReason: 'unreadable' })
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
    })
    expect(stored.matches[0]).toMatchObject({
      shortOid: 'aaaaaaa',
      // Terminated: a commit's finding is its files' findings run together, so each has to read as
      // a sentence rather than joining into one.
      finding: 'adds a loading state.',
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

  /**
   * The alternative mode: a shortlist drawn from the messages in one call, then the *same*
   * file-by-file read over only the commits it picked. So it differs in coverage, not in the
   * evidence behind the answers that come back.
   */
  describe('quick mode', () => {
    const quick = { maxCommits: 60, mode: 'quick' as const }

    /**
     * The narrowing that decides the wait. Shortlisting commits alone left a measured run at
     * ninety-four file reads, because a feature commit here touches thirty files.
     */
    it('narrows a shortlisted commit’s files before opening any of them', async () => {
      mockedScan.mockResolvedValue(scan([commit({ shortOid: 'c1' })]))
      mockedQuick.mockResolvedValue([{ shortOid: 'c1', reason: 'mentions the button' }])
      mockedFileScan.mockResolvedValue(['packages/ui/src/Button.tsx'])
      mockedDiff.mockResolvedValue({
        ...diff,
        files: [
          diff.files[0],
          { ...diff.files[0], oldPath: 'pnpm-lock.yaml', newPath: 'pnpm-lock.yaml' },
        ],
      })

      const { result } = renderHook(() => useAiCommitSearch('/repo/demo'))
      await act(async () => {
        await result.current.search('Did the Button change?', quick)
      })

      // One call over the paths, with the commit's message so a path is legible…
      expect(mockedFileScan).toHaveBeenCalledTimes(1)
      const narrowing = mockedFileScan.mock.calls[0][1]
      expect(narrowing.commit.subject).toBe('feat(ui): loading state on Button')
      expect(narrowing.files.map((f: { path: string }) => f.path)).toEqual([
        'packages/ui/src/Button.tsx',
        'pnpm-lock.yaml',
      ])
      // …and only the path it kept was opened.
      expect(mockedJudge).toHaveBeenCalledTimes(1)
      expect(mockedJudge.mock.calls[0][1].files).toEqual([
        { path: 'packages/ui/src/Button.tsx', status: 'modified' },
      ])
    })

    /** The deep mode reads everything; the narrowing belongs to the quick one alone. */
    it('does not narrow files in the deep mode', async () => {
      mockedScan.mockResolvedValue(scan([commit()]))
      const { result } = renderHook(() => useAiCommitSearch('/repo/demo'))
      await act(async () => {
        await result.current.search('Did the Button change?', options)
      })

      expect(mockedFileScan).not.toHaveBeenCalled()
    })

    it('shortlists from the messages, then opens only what it picked', async () => {
      mockedScan.mockResolvedValue(
        scan([
          commit({ shortOid: 'c1' }),
          commit({ shortOid: 'c2', oid: 'b'.repeat(40) }),
          commit({ shortOid: 'c3', oid: 'c'.repeat(40) }),
        ])
      )
      mockedQuick.mockResolvedValue([{ shortOid: 'c2', reason: 'mentions the button' }])

      const { result } = renderHook(() => useAiCommitSearch('/repo/demo'))
      await act(async () => {
        await result.current.search('Did the Button change?', quick)
      })

      // Every message was offered to the triage…
      const triaged = mockedQuick.mock.calls[0][1]
      expect(triaged.commits.map((c: { shortOid: string }) => c.shortOid)).toEqual([
        'c1',
        'c2',
        'c3',
      ])
      expect(triaged.commits[0]).not.toHaveProperty('diff')
      // …and only the one it picked cost a diff and a verdict.
      expect(mockedDiff).toHaveBeenCalledTimes(1)
      expect(mockedJudge).toHaveBeenCalledTimes(1)
      expect(mockedJudge.mock.calls[0][1].commit.shortOid).toBe('c2')
    })

    /** The shortlist is a claim about a message; the answer must rest on what the code showed. */
    it('lets the deep read overrule the shortlist', async () => {
      mockedScan.mockResolvedValue(scan([commit({ shortOid: 'candidate' })]))
      mockedQuick.mockResolvedValue([{ shortOid: 'candidate', reason: 'the subject says button' }])
      mockedJudge.mockResolvedValue({ relevant: false, finding: '', files: [] })

      const { result } = renderHook(() => useAiCommitSearch('/repo/demo'))
      await act(async () => {
        await result.current.search('Did the Button change?', quick)
      })

      expect(result.current.matches).toHaveLength(0)
      expect(mockedAnswer.mock.calls[0][1].findings).toHaveLength(0)
    })

    it('keeps the verdict the code produced, file paths included', async () => {
      mockedScan.mockResolvedValue(
        scan([commit({ shortOid: 'hit' }), commit({ shortOid: 'miss', oid: 'b'.repeat(40) })])
      )
      mockedQuick.mockResolvedValue([{ shortOid: 'hit', reason: 'the subject says button' }])

      const { result } = renderHook(() => useAiCommitSearch('/repo/demo'))
      await act(async () => {
        await result.current.search('Did the Button change?', quick)
      })

      expect(result.current.matches).toHaveLength(1)
      expect(result.current.matches[0].commit.shortOid).toBe('hit')
      // From the diff, not from the message: the finding and the paths are the deep read's.
      expect(result.current.matches[0].finding).toBe('adds a loading state.')
      expect(result.current.matches[0].files).toEqual(['packages/ui/src/Button.tsx'])
      // Both commits count as read: the skipped one was seen by the triage and dismissed.
      expect(mockedAnswer.mock.calls[0][1].scanned).toBe(2)
    })

    /** A sha nothing matches would send a full file-by-file read after a commit that does not exist. */
    it('ignores a sha the model invented', async () => {
      mockedScan.mockResolvedValue(scan([commit({ shortOid: 'real' })]))
      mockedQuick.mockResolvedValue([
        { shortOid: 'real', reason: 'yes' },
        { shortOid: 'imagined', reason: 'also yes' },
      ])

      const { result } = renderHook(() => useAiCommitSearch('/repo/demo'))
      await act(async () => {
        await result.current.search('Did the Button change?', quick)
      })

      expect(mockedJudge).toHaveBeenCalledTimes(1)
      expect(result.current.results).toHaveLength(1)
    })

    it('spends nothing further when the shortlist is empty', async () => {
      mockedScan.mockResolvedValue(scan([commit({ shortOid: 'c1' })]))
      mockedQuick.mockResolvedValue([])

      const { result } = renderHook(() => useAiCommitSearch('/repo/demo'))
      await act(async () => {
        await result.current.search('Did the Button change?', quick)
      })

      expect(mockedDiff).not.toHaveBeenCalled()
      expect(mockedJudge).not.toHaveBeenCalled()
      expect(result.current.results).toHaveLength(1)
      expect(result.current.matches).toHaveLength(0)
      expect(mockedAnswer.mock.calls[0][1].scanned).toBe(1)
    })

    /**
     * The single most important thing about an old run: a "no" from the messages is a much weaker
     * claim than a "no" from the diffs, and nothing else on the entry would tell them apart.
     */
    it('records which mode answered, on the saved run', async () => {
      const { result } = renderHook(() => useAiCommitSearch('/repo/demo'))
      await act(async () => {
        await result.current.search('Did the Button change?', quick)
      })
      await act(async () => {
        emit('ai:token', 'No.')
        emit('ai:done')
      })

      const [stored] = useAiCommitSearchStore.getState().runs['/repo/demo']
      expect(stored).toMatchObject({ mode: 'quick' })
    })

    it('reports a failed call rather than answering from nothing', async () => {
      mockedQuick.mockRejectedValue(new Error('provider down'))
      const { result } = renderHook(() => useAiCommitSearch('/repo/demo'))
      await act(async () => {
        await result.current.search('Did the Button change?', quick)
      })

      expect(result.current.phase).toBe('error')
      expect(mockedAnswer).not.toHaveBeenCalled()
    })
  })

  it('records that a deep run read the diffs, so an old answer says what it rests on', async () => {
    const { result } = renderHook(() => useAiCommitSearch('/repo/demo'))
    await act(async () => {
      await result.current.search('Did the Button change?', options)
    })
    await act(async () => {
      emit('ai:token', 'Yes.')
      emit('ai:done')
    })

    expect(useAiCommitSearchStore.getState().runs['/repo/demo'][0]).toMatchObject({ mode: 'deep' })
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

  /**
   * The bug the user reported: the panel flipped to "cancelled" and the model went on working for
   * tens of seconds. Stopping the scan only ever stopped the *next* commit; the call in flight —
   * one per file of the commit being read — ran to the end because nothing could name it.
   */
  it('calls off the verdict already in flight, by the id it was dispatched under', async () => {
    mockedScan.mockResolvedValue(scan([commit({ shortOid: 'c1' })]))
    // The verdict never answers on its own: the only thing that can end it is the cancel, which is
    // what makes this a test of reaching into a call rather than of skipping the next one.
    const pending = new Map<string, (reason: unknown) => void>()
    mockedJudge.mockImplementation(
      (_connection: unknown, _input: unknown, id: string) =>
        new Promise((_resolve, reject) => pending.set(id, reject))
    )
    mockedJudgeCancel.mockImplementation((id: string) => {
      // The abort arrives as the backend's marker, which must read as a stop and not as a commit
      // that could not be read.
      pending.get(id)?.(new Error('AI provider error: completion-cancelled'))
      return Promise.resolve()
    })

    const { result } = renderHook(() => useAiCommitSearch('/repo/demo'))
    let searching!: Promise<void>
    await act(async () => {
      searching = result.current.search('Did the Button change?', options)
      await waitFor(() => expect(mockedJudge).toHaveBeenCalled())
    })

    await act(async () => {
      await result.current.cancel()
      await searching
    })

    const dispatchedId = mockedJudge.mock.calls[0][2] as string
    expect(mockedJudgeCancel).toHaveBeenCalledWith(dispatchedId)
    expect(result.current.phase).toBe('cancelled')
    // Not recorded as unread: the user's own stop is not a commit the provider failed on.
    expect(result.current.unread).toEqual([])
  })

  it('calls off the quick mode’s triage pass, which the scan does not own', async () => {
    mockedScan.mockResolvedValue(scan([commit({ shortOid: 'c1' })]))
    const pending = new Map<string, (reason: unknown) => void>()
    mockedQuick.mockImplementation(
      (_connection: unknown, _input: unknown, id: string) =>
        new Promise((_resolve, reject) => pending.set(id, reject))
    )
    mockedQuickCancel.mockImplementation((id: string) => {
      pending.get(id)?.(new Error('AI provider error: completion-cancelled'))
      return Promise.resolve()
    })

    const { result } = renderHook(() => useAiCommitSearch('/repo/demo'))
    let searching!: Promise<void>
    await act(async () => {
      searching = result.current.search('Did the Button change?', { ...options, mode: 'quick' })
      await waitFor(() => expect(mockedQuick).toHaveBeenCalled())
    })

    await act(async () => {
      await result.current.cancel()
      await searching
    })

    // One completion carrying a month of subjects: the longest request of the run, the one most
    // likely to be underway when the user gives up, and the one `scanCommits` cannot see.
    expect(mockedQuickCancel).toHaveBeenCalledWith(mockedQuick.mock.calls[0][2] as string)
    expect(result.current.phase).toBe('cancelled')
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
