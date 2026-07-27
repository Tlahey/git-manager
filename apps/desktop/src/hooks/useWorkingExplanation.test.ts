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
  summaryExplanationService: { run: vi.fn(), cancel: vi.fn() },
}))

import { apiGetAiContext, fileSummaryService, summaryExplanationService } from '../api/ai.api'
import { useWorkingExplanation } from './useWorkingExplanation'
import { useAiExplanationStore } from '../stores/aiExplanation.store'
import { useSettingsStore } from '../stores/settings.store'

const mockedGetContext = apiGetAiContext as unknown as ReturnType<typeof vi.fn>
const mockedRun = summaryExplanationService.run as unknown as ReturnType<typeof vi.fn>
const mockedSummarize = fileSummaryService.run as unknown as ReturnType<typeof vi.fn>

const workingContext: AiContext = {
  diff: 'working diff',
  repoName: 'demo',
  branch: 'feat/login',
  files: [{ path: 'a.ts', status: 'modified' }],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedSummarize.mockResolvedValue({ intent: 'does a thing', area: 'demo area' })
  listeners.clear()
  useAiExplanationStore.setState({ explanations: {} })
  mockedGetContext.mockResolvedValue(workingContext)
  mockedRun.mockResolvedValue(undefined)
})

describe('useWorkingExplanation', () => {
  it('reads the working scope — everything uncommitted, untracked included', async () => {
    const { result } = renderHook(() => useWorkingExplanation('/repo'))
    await act(async () => {
      await result.current.explain()
    })
    expect(mockedGetContext).toHaveBeenCalledWith('/repo', 'working')
  })

  it('summarizes every changed file, then streams the summary from the summaries', async () => {
    useSettingsStore.setState((s) => ({ settings: { ...s.settings, language: 'fr' } }))
    const { result } = renderHook(() => useWorkingExplanation('/repo'))
    await act(async () => {
      await result.current.explain()
    })

    expect(mockedSummarize).toHaveBeenCalledTimes(workingContext.files.length)
    expect(mockedRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        scope: 'working',
        summaries: workingContext.files.map((f) => ({
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
    const { result } = renderHook(() => useWorkingExplanation('/repo'))
    await act(async () => {
      await result.current.explain()
    })
    await act(async () => {
      emit('ai:token', 'Two things ')
      emit('ai:token', 'in flight')
      emit('ai:done')
    })
    expect(result.current.text).toBe('Two things in flight')
    expect(result.current.status).toBe('done')
  })

  it('refuses a clean working tree without calling the model', async () => {
    mockedGetContext.mockResolvedValue({ ...workingContext, diff: '   \n ' })
    const { result } = renderHook(() => useWorkingExplanation('/repo'))
    await act(async () => {
      await result.current.explain()
    })
    expect(mockedRun).not.toHaveBeenCalled()
    expect(result.current.error).toBe('AI_NO_WORKING_CHANGES')
  })

  it('surfaces a failure from the context fetch', async () => {
    mockedGetContext.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useWorkingExplanation('/repo'))
    await act(async () => {
      await result.current.explain()
    })
    expect(result.current.status).toBe('error')
    expect(result.current.error).toContain('boom')
  })

  it('remembers nothing — the working tree moves under any stored answer', async () => {
    const { result } = renderHook(() => useWorkingExplanation('/repo'))
    await act(async () => {
      await result.current.explain()
    })
    await act(async () => {
      emit('ai:token', 'a summary')
      emit('ai:done')
    })

    expect(useAiExplanationStore.getState().explanations).toEqual({})
    expect(result.current.hasStored).toBe(false)
    expect(result.current.generatedAt).toBeNull()
  })

  it('starts blank on a fresh mount, so the panel regenerates every time', async () => {
    const first = renderHook(() => useWorkingExplanation('/repo'))
    await act(async () => {
      await first.result.current.explain()
    })
    await act(async () => {
      emit('ai:token', 'a summary')
      emit('ai:done')
    })
    first.unmount()

    const { result } = renderHook(() => useWorkingExplanation('/repo'))
    expect(result.current.text).toBe('')
  })
})
