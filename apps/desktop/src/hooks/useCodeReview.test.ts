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

function emit(event: string, payload?: unknown) {
  listeners.get(event)?.forEach((h) => h({ payload }))
}

vi.mock('../api/ai.api', () => ({
  apiGetAiContext: vi.fn(),
  codeReviewService: { run: vi.fn(), cancel: vi.fn() },
}))

import { apiGetAiContext, codeReviewService } from '../api/ai.api'
import { useCodeReview } from './useCodeReview'
import { useAiExplanationStore } from '../stores/aiExplanation.store'
import { useSettingsStore } from '../stores/settings.store'

const mockedGetContext = apiGetAiContext as unknown as ReturnType<typeof vi.fn>
const mockedRun = codeReviewService.run as unknown as ReturnType<typeof vi.fn>

const workingContext: AiContext = {
  diff: 'working diff',
  repoName: 'demo',
  branch: 'feat/login',
  files: [{ path: 'a.ts', status: 'modified' }],
}

const rangeContext: AiContext = {
  ...workingContext,
  diff: 'range diff',
  baseRef: 'origin/main',
  rangeCommits: ['feat: a'],
}

/** Streams a full generation to completion. */
async function generate(start: () => Promise<void>, text = '**Looks fine.**') {
  await act(async () => {
    await start()
  })
  await act(async () => {
    emit('ai:token', text)
    emit('ai:done')
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  listeners.clear()
  useAiExplanationStore.setState({ explanations: {} })
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, language: 'en', ai: { ...s.settings.ai, contextTokens: 4096 } },
  }))
  mockedGetContext.mockResolvedValue(workingContext)
  mockedRun.mockResolvedValue(undefined)
})

describe('useCodeReview — working scope', () => {
  it('reads the uncommitted tree', async () => {
    const { result } = renderHook(() => useCodeReview('/repo', { scope: 'working' }))
    await act(async () => {
      await result.current.review()
    })
    expect(mockedGetContext).toHaveBeenCalledWith('/repo', 'working')
  })

  it('tags the request as a working-tree review and passes the UI language', async () => {
    useSettingsStore.setState((s) => ({ settings: { ...s.settings, language: 'fr' } }))
    const { result } = renderHook(() => useCodeReview('/repo', { scope: 'working' }))
    await act(async () => {
      await result.current.review()
    })
    expect(mockedRun).toHaveBeenCalledWith(expect.anything(), {
      context: workingContext,
      scope: 'working',
      language: 'fr',
      contextTokens: 4096,
    })
  })

  it('refuses a clean tree without calling the model', async () => {
    mockedGetContext.mockResolvedValue({ ...workingContext, diff: '  \n ' })
    const { result } = renderHook(() => useCodeReview('/repo', { scope: 'working' }))
    await act(async () => {
      await result.current.review()
    })
    expect(mockedRun).not.toHaveBeenCalled()
    expect(result.current.error).toBe('AI_NO_WORKING_CHANGES')
  })

  it('accumulates streamed tokens', async () => {
    const { result } = renderHook(() => useCodeReview('/repo', { scope: 'working' }))
    await generate(() => result.current.review(), '**Bug in `a.ts`**')
    expect(result.current.text).toBe('**Bug in `a.ts`**')
    expect(result.current.status).toBe('done')
  })

  it('never remembers a working-tree review — the tree moves under it', async () => {
    const { result } = renderHook(() => useCodeReview('/repo', { scope: 'working' }))
    await generate(() => result.current.review(), 'a review')

    expect(useAiExplanationStore.getState().explanations).toEqual({})
    expect(result.current.hasStored).toBe(false)
    expect(result.current.generatedAt).toBeNull()
  })
})

describe('useCodeReview — prompt size', () => {
  it('is unknown until a run has fetched the diff', () => {
    const { result } = renderHook(() => useCodeReview('/repo', { scope: 'working' }))
    expect(result.current.promptSize).toBeNull()
  })

  it('measures the real prompt, and grows with the diff', async () => {
    const { result } = renderHook(() => useCodeReview('/repo', { scope: 'working' }))
    await act(async () => {
      await result.current.review()
    })
    const small = result.current.promptSize!
    // The instruction alone is over a thousand tokens, so any real prompt clears that.
    expect(small.tokens).toBeGreaterThan(100)
    expect(small.risk).toBe('ok')

    mockedGetContext.mockResolvedValue({ ...workingContext, diff: 'x'.repeat(60_000) })
    await act(async () => {
      await result.current.review()
    })
    expect(result.current.promptSize!.tokens).toBeGreaterThan(small.tokens)
  })

  it('shrinks the diff to fit rather than overflowing the window', async () => {
    // The point of deriving the budget from the window: a huge diff no longer produces an oversized
    // prompt, it produces a smaller diff. The warning became a safety net, not the usual outcome.
    mockedGetContext.mockResolvedValue({ ...workingContext, diff: 'x'.repeat(60_000) })
    const { result } = renderHook(() => useCodeReview('/repo', { scope: 'working' }))
    await act(async () => {
      await result.current.review()
    })
    expect(result.current.promptSize!.risk).toBe('ok')
  })

  it('still flags a window too small to hold the instruction itself', async () => {
    // Nothing can be budgeted away here — the instruction is fixed. This is the case the warning
    // exists for, and no amount of trimming the diff fixes it.
    useSettingsStore.setState((s) => ({ settings: { ...s.settings, ai: { ...s.settings.ai, contextTokens: 800 } } }))
    const { result } = renderHook(() => useCodeReview('/repo', { scope: 'working' }))
    await act(async () => {
      await result.current.review()
    })
    expect(result.current.promptSize!.risk).toBe('over')
    expect(result.current.promptSize!.contextTokens).toBe(800)
  })

  it('sends more diff when a larger window is declared', async () => {
    const big = 'x'.repeat(60_000)
    mockedGetContext.mockResolvedValue({ ...workingContext, diff: big })
    const { result } = renderHook(() => useCodeReview('/repo', { scope: 'working' }))
    await act(async () => {
      await result.current.review()
    })
    const onDefault = result.current.promptSize!.tokens

    useSettingsStore.setState((s) => ({ settings: { ...s.settings, ai: { ...s.settings.ai, contextTokens: 32768 } } }))
    const { result: wide } = renderHook(() => useCodeReview('/repo', { scope: 'working' }))
    await act(async () => {
      await wide.current.review()
    })
    expect(wide.current.promptSize!.tokens).toBeGreaterThan(onDefault * 2)
  })

  it('is recorded even when the run then fails — it may be the reason', async () => {
    mockedRun.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useCodeReview('/repo', { scope: 'working' }))
    await act(async () => {
      await result.current.review()
    })
    expect(result.current.status).toBe('error')
    expect(result.current.promptSize).not.toBeNull()
  })

  it('is dropped by clear, along with the text', async () => {
    const { result } = renderHook(() => useCodeReview('/repo', { scope: 'working' }))
    await generate(() => result.current.review(), 'a review')
    act(() => result.current.clear())
    expect(result.current.promptSize).toBeNull()
  })
})

describe('useCodeReview — branch scope', () => {
  beforeEach(() => {
    mockedGetContext.mockResolvedValue(rangeContext)
  })

  it('scopes the range to the named branch instead of HEAD', async () => {
    const { result } = renderHook(() =>
      useCodeReview('/repo', { scope: 'branch', branch: 'feat/login' })
    )
    await act(async () => {
      await result.current.review('origin/main')
    })
    expect(mockedGetContext).toHaveBeenCalledWith('/repo', 'range', 'origin/main', 'feat/login')
  })

  it('tags the request as a branch review', async () => {
    const { result } = renderHook(() =>
      useCodeReview('/repo', { scope: 'branch', branch: 'feat/login' })
    )
    await act(async () => {
      await result.current.review('origin/main')
    })
    expect(mockedRun).toHaveBeenCalledWith(expect.anything(), {
      context: rangeContext,
      scope: 'branch',
      language: 'en',
      // The declared window travels with the input: it sizes how much diff is sent.
      contextTokens: 4096,
    })
  })

  it('refuses a branch level with its base, without calling the model', async () => {
    mockedGetContext.mockResolvedValue({ ...rangeContext, diff: '   ' })
    const { result } = renderHook(() => useCodeReview('/repo', { scope: 'branch', branch: 'main' }))
    await act(async () => {
      await result.current.review('origin/main')
    })
    expect(mockedRun).not.toHaveBeenCalled()
    expect(result.current.error).toBe('AI_NO_BRANCH_CHANGES')
  })

  it('refuses to run without a base, rather than reviewing the wrong range', async () => {
    const { result } = renderHook(() =>
      useCodeReview('/repo', { scope: 'branch', branch: 'feat/login' })
    )
    await act(async () => {
      await result.current.review()
    })
    expect(mockedGetContext).not.toHaveBeenCalled()
    expect(result.current.error).toBe('AI_NO_BRANCH_CHANGES')
  })

  it('surfaces a failure from the context fetch', async () => {
    mockedGetContext.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() =>
      useCodeReview('/repo', { scope: 'branch', branch: 'feat/login' })
    )
    await act(async () => {
      await result.current.review('origin/main')
    })
    expect(result.current.status).toBe('error')
    expect(result.current.error).toContain('boom')
  })
})

describe('useCodeReview — branch memory', () => {
  beforeEach(() => {
    mockedGetContext.mockResolvedValue(rangeContext)
  })

  it('remembers a completed review, with its base and a timestamp', async () => {
    const { result } = renderHook(() =>
      useCodeReview('/repo', { scope: 'branch', branch: 'feat/login' })
    )
    await generate(() => result.current.review('origin/main'), 'a review')

    const stored = useAiExplanationStore.getState().get('/repo', 'branch-review', 'feat/login')
    expect(stored).toMatchObject({ text: 'a review', comparedTo: 'origin/main' })
    expect(stored!.generatedAt).toBeGreaterThan(0)
    expect(result.current.hasStored).toBe(true)
  })

  it('does not collide with the branch explanation of the same branch', async () => {
    const { result } = renderHook(() =>
      useCodeReview('/repo', { scope: 'branch', branch: 'feat/login' })
    )
    await generate(() => result.current.review('origin/main'), 'a review')

    // The explanation slot for the very same branch must stay empty — they are different documents.
    expect(useAiExplanationStore.getState().get('/repo', 'branch', 'feat/login')).toBeUndefined()
  })

  it('does not remember a failed run', async () => {
    mockedGetContext.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() =>
      useCodeReview('/repo', { scope: 'branch', branch: 'feat/login' })
    )
    await act(async () => {
      await result.current.review('origin/main')
    })
    expect(
      useAiExplanationStore.getState().get('/repo', 'branch-review', 'feat/login')
    ).toBeUndefined()
  })

  it('does not remember a cancelled run', async () => {
    const { result } = renderHook(() =>
      useCodeReview('/repo', { scope: 'branch', branch: 'feat/login' })
    )
    await act(async () => {
      await result.current.review('origin/main')
    })
    await act(async () => {
      emit('ai:token', 'half a fin')
      emit('ai:cancelled')
    })
    expect(
      useAiExplanationStore.getState().get('/repo', 'branch-review', 'feat/login')
    ).toBeUndefined()
  })

  it('serves the remembered review on a fresh mount, without generating', async () => {
    const first = renderHook(() =>
      useCodeReview('/repo', { scope: 'branch', branch: 'feat/login' })
    )
    await generate(() => first.result.current.review('origin/main'), 'a review')
    first.unmount()
    vi.clearAllMocks()

    const { result } = renderHook(() =>
      useCodeReview('/repo', { scope: 'branch', branch: 'feat/login' })
    )
    expect(result.current.text).toBe('a review')
    expect(result.current.comparedTo).toBe('origin/main')
    expect(mockedRun).not.toHaveBeenCalled()
  })

  it('keeps each branch of each repo separate', async () => {
    const a = renderHook(() => useCodeReview('/repo', { scope: 'branch', branch: 'feat/a' }))
    await generate(() => a.result.current.review('origin/main'), 'about a')
    a.unmount()

    const b = renderHook(() => useCodeReview('/repo', { scope: 'branch', branch: 'feat/b' }))
    expect(b.result.current.hasStored).toBe(false)

    const other = renderHook(() =>
      useCodeReview('/other-repo', { scope: 'branch', branch: 'feat/a' })
    )
    expect(other.result.current.hasStored).toBe(false)
  })

  it('clear forgets the remembered review', async () => {
    const { result } = renderHook(() =>
      useCodeReview('/repo', { scope: 'branch', branch: 'feat/login' })
    )
    await generate(() => result.current.review('origin/main'), 'a review')

    act(() => result.current.clear())
    expect(
      useAiExplanationStore.getState().get('/repo', 'branch-review', 'feat/login')
    ).toBeUndefined()
    expect(result.current.text).toBe('')
  })
})
