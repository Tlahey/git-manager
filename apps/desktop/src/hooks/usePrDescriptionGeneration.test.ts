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
  fileSummaryService: { run: vi.fn() },
  apiGetAiContext: vi.fn(),
  summaryPrDescriptionService: { run: vi.fn(), cancel: vi.fn() },
}))

import { apiGetAiContext, fileSummaryService, summaryPrDescriptionService } from '../api/ai.api'
import { usePrDescriptionGeneration } from './usePrDescriptionGeneration'

const mockedGetContext = apiGetAiContext as unknown as ReturnType<typeof vi.fn>
const mockedRun = summaryPrDescriptionService.run as unknown as ReturnType<typeof vi.fn>
const mockedSummarize = fileSummaryService.run as unknown as ReturnType<typeof vi.fn>

const rangeContext: AiContext = {
  diff: 'branch diff',
  repoName: 'demo',
  branch: 'feat/x',
  files: [{ path: 'a.ts', status: 'modified' }],
  baseRef: 'main',
  rangeCommits: ['feat: a'],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedSummarize.mockResolvedValue({ intent: 'does a thing', area: 'demo area' })
  listeners.clear()
  mockedGetContext.mockResolvedValue(rangeContext)
  mockedRun.mockResolvedValue(undefined)
})

describe('usePrDescriptionGeneration', () => {
  it('fetches range context for the base ref and streams tokens to the callbacks', async () => {
    const onToken = vi.fn()
    const onDone = vi.fn()
    const { result } = renderHook(() => usePrDescriptionGeneration('/repo'))

    await act(async () => {
      await result.current.generate('main', '## Template', onToken, onDone)
    })

    expect(mockedGetContext).toHaveBeenCalledWith('/repo', 'range', 'main')
    // Every file is read on its own before a word of the published description is written.
    expect(mockedSummarize).toHaveBeenCalledTimes(rangeContext.files.length)
    expect(mockedRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        branch: rangeContext.branch,
        templateContent: '## Template',
        summaries: rangeContext.files.map((f) => ({
          path: f.path,
          status: f.status,
          intent: 'does a thing',
          area: 'demo area',
        })),
        contextTokens: 4096,
      }),
      expect.any(String)
    )

    await act(async () => {
      emit('ai:token', 'Hello ')
      emit('ai:token', 'world')
      emit('ai:done')
    })
    expect(onToken).toHaveBeenCalledWith('Hello ')
    expect(onDone).toHaveBeenCalledWith('Hello world')
    expect(result.current.status).toBe('done')
  })

  it('errors when the branch has no changes to describe', async () => {
    mockedGetContext.mockResolvedValue({ ...rangeContext, diff: '   ' })
    const { result } = renderHook(() => usePrDescriptionGeneration('/repo'))
    await act(async () => {
      await result.current.generate('main', null, vi.fn(), vi.fn())
    })
    expect(mockedRun).not.toHaveBeenCalled()
    expect(result.current.status).toBe('error')
  })
})

// This hook carried its own copy of the `ai:*` plumbing until `useAiStream` learned to forward
// tokens to a caller-owned surface. The copy had two bugs; these are them.
describe('usePrDescriptionGeneration — inherited from useAiStream', () => {
  it('drops its listeners when the composer unmounts mid-stream', async () => {
    const { result, unmount } = renderHook(() => usePrDescriptionGeneration('/repo'))
    await act(async () => {
      await result.current.generate('main', null, vi.fn(), vi.fn())
    })
    expect(listeners.get('ai:token')?.size).toBe(1)

    unmount()

    expect(listeners.get('ai:token')?.size ?? 0).toBe(0)
    expect(listeners.get('ai:done')?.size ?? 0).toBe(0)
  })

  it('does not stack listeners across runs — a token counts once', async () => {
    const onToken = vi.fn()
    const { result } = renderHook(() => usePrDescriptionGeneration('/repo'))
    await act(async () => {
      await result.current.generate('main', null, vi.fn(), vi.fn())
    })
    await act(async () => {
      await result.current.generate('main', null, onToken, vi.fn())
    })

    await act(async () => emit('ai:token', 'x'))

    expect(onToken).toHaveBeenCalledExactlyOnceWith('x')
    expect(listeners.get('ai:token')?.size).toBe(1)
  })

  it('ignores a generation that is not its own', async () => {
    const onToken = vi.fn()
    const onDone = vi.fn()
    const { result } = renderHook(() => usePrDescriptionGeneration('/repo'))
    await act(async () => {
      await result.current.generate('main', null, onToken, onDone)
    })

    await act(async () => {
      emit('ai:token', 'not mine', 'another-generation')
      emit('ai:done', undefined, 'another-generation')
    })

    expect(onToken).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
    expect(result.current.status).toBe('connecting')
  })

  it('does not overwrite the composer with an empty answer', async () => {
    // A stream that produced nothing has no result worth writing back — calling `onDone('')` would
    // blank a textarea the author may already have typed into.
    const onDone = vi.fn()
    const { result } = renderHook(() => usePrDescriptionGeneration('/repo'))
    await act(async () => {
      await result.current.generate('main', null, vi.fn(), onDone)
    })

    await act(async () => emit('ai:done'))

    expect(onDone).not.toHaveBeenCalled()
    expect(result.current.status).toBe('done')
  })

  it('does not call onDone on a cancelled run', async () => {
    const onDone = vi.fn()
    const { result } = renderHook(() => usePrDescriptionGeneration('/repo'))
    await act(async () => {
      await result.current.generate('main', null, vi.fn(), onDone)
    })

    await act(async () => {
      emit('ai:token', 'half a draft')
      emit('ai:cancelled')
    })

    expect(onDone).not.toHaveBeenCalled()
    expect(result.current.status).toBe('cancelled')
  })
})
