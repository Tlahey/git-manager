import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { AiContext } from '@git-manager/ai'

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
  apiGetAiContext: vi.fn(),
  fileSummaryService: { run: vi.fn() },
  summaryExplanationService: { run: vi.fn(), cancel: vi.fn() },
}))

import { apiGetAiContext, fileSummaryService, summaryExplanationService } from '../api/ai.api'
import { useBranchExplanation } from './useBranchExplanation'
import { useAiExplanationStore } from '../stores/aiExplanation.store'

const mockedGetContext = apiGetAiContext as unknown as ReturnType<typeof vi.fn>
const mockedRun = summaryExplanationService.run as unknown as ReturnType<typeof vi.fn>
const mockedSummarize = fileSummaryService.run as unknown as ReturnType<typeof vi.fn>

const rangeContext: AiContext = {
  diff: 'branch diff',
  repoName: 'demo',
  branch: 'feat/login',
  files: [{ path: 'a.ts', status: 'modified' }],
  baseRef: 'origin/main',
  rangeCommits: ['feat: a'],
}

/** Streams a full generation to completion. */
async function generate(explain: () => Promise<void>, text = 'Adds login') {
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
  mockedGetContext.mockResolvedValue(rangeContext)
  mockedRun.mockResolvedValue(undefined)
})

describe('useBranchExplanation', () => {
  it('scopes the range to the named branch instead of HEAD', async () => {
    const { result } = renderHook(() => useBranchExplanation('/repo', 'feat/login'))
    await act(async () => {
      await result.current.explain('origin/main')
    })
    expect(mockedGetContext).toHaveBeenCalledWith('/repo', 'range', 'origin/main', 'feat/login')
  })

  it('summarizes every file, then streams the explanation from the summaries', async () => {
    const { result } = renderHook(() => useBranchExplanation('/repo', 'feature/x'))

    await act(async () => result.current.explain('origin/main'))

    // One call per changed file before a word of the explanation is written.
    expect(mockedSummarize).toHaveBeenCalledTimes(rangeContext.files.length)
    expect(mockedRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        scope: 'branch',
        branch: 'feature/x',
        summaries: rangeContext.files.map((f) => ({
          path: f.path,
          status: f.status,
          intent: 'does a thing',
          area: 'demo area',
        })),
        language: 'fr',
      }),
      expect.any(String)
    )
  })

  it('accumulates streamed tokens', async () => {
    const { result } = renderHook(() => useBranchExplanation('/repo', 'feat/login'))
    await generate(() => result.current.explain('origin/main'), 'Adds login')
    expect(result.current.text).toBe('Adds login')
    expect(result.current.status).toBe('done')
  })

  it('refuses a branch that is level with its base, without calling the model', async () => {
    mockedGetContext.mockResolvedValue({ ...rangeContext, diff: '  \n ' })
    const { result } = renderHook(() => useBranchExplanation('/repo', 'main'))
    await act(async () => {
      await result.current.explain('origin/main')
    })
    expect(mockedRun).not.toHaveBeenCalled()
    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe('AI_NO_BRANCH_CHANGES')
  })

  it('surfaces a failure from the context fetch', async () => {
    mockedGetContext.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useBranchExplanation('/repo', 'feat/login'))
    await act(async () => {
      await result.current.explain('origin/main')
    })
    expect(result.current.status).toBe('error')
    expect(result.current.error).toContain('boom')
  })
})

describe('useBranchExplanation — memory', () => {
  it('remembers a completed explanation, with its base and a timestamp', async () => {
    const { result } = renderHook(() => useBranchExplanation('/repo', 'feat/login'))
    await generate(() => result.current.explain('origin/main'), 'Adds login')

    const stored = useAiExplanationStore.getState().get('/repo', 'branch', 'feat/login')
    expect(stored).toMatchObject({ text: 'Adds login', comparedTo: 'origin/main' })
    expect(stored!.generatedAt).toBeGreaterThan(0)
    expect(result.current.hasStored).toBe(true)
  })

  it('does not remember a failed run', async () => {
    mockedGetContext.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useBranchExplanation('/repo', 'feat/login'))
    await act(async () => {
      await result.current.explain('origin/main')
    })
    expect(useAiExplanationStore.getState().get('/repo', 'branch', 'feat/login')).toBeUndefined()
  })

  it('does not remember a cancelled run', async () => {
    const { result } = renderHook(() => useBranchExplanation('/repo', 'feat/login'))
    await act(async () => {
      await result.current.explain('origin/main')
    })
    await act(async () => {
      emit('ai:token', 'half a sen')
      emit('ai:cancelled')
    })
    expect(useAiExplanationStore.getState().get('/repo', 'branch', 'feat/login')).toBeUndefined()
  })

  it('serves the remembered explanation on a fresh mount, without generating', async () => {
    const first = renderHook(() => useBranchExplanation('/repo', 'feat/login'))
    await generate(() => first.result.current.explain('origin/main'), 'Adds login')
    first.unmount()
    vi.clearAllMocks()

    const { result } = renderHook(() => useBranchExplanation('/repo', 'feat/login'))
    expect(result.current.text).toBe('Adds login')
    expect(result.current.generatedAt).not.toBeNull()
    expect(result.current.comparedTo).toBe('origin/main')
    expect(mockedRun).not.toHaveBeenCalled()
  })

  it('keeps each branch of each repo separate', async () => {
    const a = renderHook(() => useBranchExplanation('/repo', 'feat/a'))
    await generate(() => a.result.current.explain('origin/main'), 'about a')
    a.unmount()

    const b = renderHook(() => useBranchExplanation('/repo', 'feat/b'))
    expect(b.result.current.text).toBe('')
    expect(b.result.current.hasStored).toBe(false)

    const other = renderHook(() => useBranchExplanation('/other-repo', 'feat/a'))
    expect(other.result.current.hasStored).toBe(false)
  })

  it('clear forgets the remembered explanation', async () => {
    const { result } = renderHook(() => useBranchExplanation('/repo', 'feat/login'))
    await generate(() => result.current.explain('origin/main'), 'Adds login')

    act(() => result.current.clear())
    expect(useAiExplanationStore.getState().get('/repo', 'branch', 'feat/login')).toBeUndefined()
    expect(result.current.text).toBe('')
  })

  it('overwrites the previous explanation when regenerated', async () => {
    const { result } = renderHook(() => useBranchExplanation('/repo', 'feat/login'))
    await generate(() => result.current.explain('origin/main'), 'first')
    await generate(() => result.current.explain('origin/main'), 'second')

    expect(useAiExplanationStore.getState().get('/repo', 'branch', 'feat/login')?.text).toBe('second')
  })
})
