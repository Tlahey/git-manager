import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
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

/** The request id the hook minted for the generation in flight, read back off the mocked service.
 * Every `ai:*` event now carries one and every listener filters on it, so an event emitted without
 * the right id is ignored — see the cross-talk tests below. */
function currentRequestId(): string {
  return (mockedRun.mock.calls.at(-1)?.[2] as string) ?? 'no-run-started'
}

function emit(event: string, token?: string, requestId: string = currentRequestId()) {
  listeners.get(event)?.forEach((h) => h({ payload: { requestId, token } }))
}

vi.mock('../api/ai.api', () => ({
  fileSummaryService: { run: vi.fn() },
  summaryExplanationService: { run: vi.fn(), cancel: vi.fn() },
}))
vi.mock('../api/git.api', () => ({ apiGetCommitDiff: vi.fn() }))

import { fileSummaryService, summaryExplanationService } from '../api/ai.api'
import { apiGetCommitDiff } from '../api/git.api'
import { useCommitExplanation, type CommitExplanationSubject } from './useCommitExplanation'
import { useAiExplanationStore } from '../stores/aiExplanation.store'
import { useSettingsStore } from '../stores/settings.store'

const mockedDiff = apiGetCommitDiff as unknown as ReturnType<typeof vi.fn>
const mockedRun = summaryExplanationService.run as unknown as ReturnType<typeof vi.fn>
const mockedSummarize = fileSummaryService.run as unknown as ReturnType<typeof vi.fn>

const diff: GitDiff = {
  files: [
    {
      oldPath: 'src/a.ts',
      newPath: 'src/a.ts',
      status: 'modified',
      additions: 2,
      deletions: 1,
      isBinary: false,
      hunks: [
        {
          header: '@@ -1,2 +1,3 @@',
          lines: [{ origin: '+', content: 'const b = 2', oldLineno: null, newLineno: 2 }],
        },
      ],
    },
  ],
  totalAdditions: 2,
  totalDeletions: 1,
}

function subject(overrides: Partial<CommitExplanationSubject> = {}): CommitExplanationSubject {
  return {
    oid: 'abc1234def',
    shortOid: 'abc1234',
    subject: 'feat: add login',
    body: 'Closes #12.',
    author: 'Ada',
    parentCount: 1,
    ...overrides,
  }
}

async function generate(explain: () => Promise<void>, text = 'Adds a constant') {
  await act(async () => {
    await explain()
  })
  await act(async () => {
    emit('ai:token', text)
    emit('ai:done')
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedSummarize.mockResolvedValue({ intent: 'does a thing', area: 'demo area' })
  listeners.clear()
  useAiExplanationStore.setState({ explanations: {} })
  mockedDiff.mockResolvedValue(diff)
  mockedRun.mockResolvedValue(undefined)
})

describe('useCommitExplanation', () => {
  it('summarizes each touched file, then streams the explanation from the summaries', async () => {
    const { result } = renderHook(() => useCommitExplanation('/repo/demo', subject()))

    await act(async () => result.current.explain())

    expect(mockedDiff).toHaveBeenCalledWith('/repo/demo', subject().oid)
    // One call per file the commit touches, before a word of the explanation is written.
    expect(mockedSummarize).toHaveBeenCalledTimes(diff.files.length)
    expect(mockedRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        scope: 'commit',
        repoName: 'demo',
        commit: expect.objectContaining({ shortOid: subject().shortOid, subject: subject().subject }),
        summaries: expect.arrayContaining([
          expect.objectContaining({ path: 'src/a.ts', intent: 'does a thing' }),
        ]),
      }),
      expect.any(String)
    )
  })

  it('summarizes from the path the patch header carries, so the slices line up', async () => {
    const { result } = renderHook(() => useCommitExplanation('/repo/demo', subject()))

    await act(async () => result.current.explain())

    const paths = mockedSummarize.mock.calls.map((c) => c[1].path)
    expect(paths).toEqual(diff.files.map((f) => f.newPath || f.oldPath))
  })




  it('refuses a commit with no textual diff, without calling the model', async () => {
    mockedDiff.mockResolvedValue({ files: [], totalAdditions: 0, totalDeletions: 0 })
    const { result } = renderHook(() => useCommitExplanation('/repo/demo', subject()))
    await act(async () => {
      await result.current.explain()
    })
    expect(mockedRun).not.toHaveBeenCalled()
    expect(result.current.error).toBe('AI_NO_COMMIT_CHANGES')
  })


  it("uses the path the patch's own header carries, so dropped files can be marked", async () => {
    // A deletion has no new path; `formatUnifiedPatch` writes the old one into `diff --git`, and the
    // list has to agree with it or a file left out of the budget cannot be marked as such.
    mockedDiff.mockResolvedValue({
      ...diff,
      files: [{ ...diff.files[0], oldPath: 'src/gone.ts', newPath: '', status: 'deleted' }],
    })
    const { result } = renderHook(() => useCommitExplanation('/repo/demo', subject()))
    await act(async () => {
      await result.current.explain()
    })
    // The path handed to the map phase has to be the one `formatUnifiedPatch` wrote into the
    // `diff --git` header, or `splitDiffByFile` cannot find that file's slice.
    expect(mockedSummarize.mock.calls[0][1].path).toBe('src/gone.ts')
    expect(mockedSummarize.mock.calls[0][1].diff).toContain('diff --git a/src/gone.ts b/src/gone.ts')
  })

  it("sizes the patch against the model's declared context window", async () => {
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, ai: { ...s.settings.ai, contextTokens: 32768 } },
    }))
    const { result } = renderHook(() => useCommitExplanation('/repo/demo', subject()))
    await act(async () => {
      await result.current.explain()
    })
    // Passed through rather than left to the pessimistic default: the flat 8000-character cut it
    // replaces overflowed a small window and starved a large one.
    expect(mockedRun.mock.calls[0][1].contextTokens).toBe(32768)
  })

  it('surfaces a failure from the diff fetch', async () => {
    mockedDiff.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useCommitExplanation('/repo/demo', subject()))
    await act(async () => {
      await result.current.explain()
    })
    expect(result.current.status).toBe('error')
    expect(result.current.error).toContain('boom')
  })
})

describe('useCommitExplanation — memory', () => {
  it('remembers a completed explanation against the parent', async () => {
    const { result } = renderHook(() => useCommitExplanation('/repo/demo', subject()))
    await generate(() => result.current.explain())

    expect(
      useAiExplanationStore.getState().get('/repo/demo', 'commit', 'abc1234def')
    ).toMatchObject({ text: 'Adds a constant', comparedTo: 'abc1234^' })
  })

  it('records a root commit as compared to nothing', async () => {
    const { result } = renderHook(() =>
      useCommitExplanation('/repo/demo', subject({ parentCount: 0 }))
    )
    await generate(() => result.current.explain())
    expect(
      useAiExplanationStore.getState().get('/repo/demo', 'commit', 'abc1234def')?.comparedTo
    ).toBe('root')
  })

  it('serves the remembered explanation on a fresh mount, without regenerating', async () => {
    const first = renderHook(() => useCommitExplanation('/repo/demo', subject()))
    await generate(() => first.result.current.explain())
    first.unmount()
    vi.clearAllMocks()

    const { result } = renderHook(() => useCommitExplanation('/repo/demo', subject()))
    expect(result.current.text).toBe('Adds a constant')
    expect(result.current.hasStored).toBe(true)
    expect(mockedRun).not.toHaveBeenCalled()
  })

  it('does not collide with a branch explanation of the same name', async () => {
    useAiExplanationStore
      .getState()
      .set('/repo/demo', 'branch', 'abc1234def', 'main', 'branch text')
    const { result } = renderHook(() => useCommitExplanation('/repo/demo', subject()))
    expect(result.current.hasStored).toBe(false)
  })

  it('clear forgets it', async () => {
    const { result } = renderHook(() => useCommitExplanation('/repo/demo', subject()))
    await generate(() => result.current.explain())
    act(() => result.current.clear())
    expect(
      useAiExplanationStore.getState().get('/repo/demo', 'commit', 'abc1234def')
    ).toBeUndefined()
  })
})
