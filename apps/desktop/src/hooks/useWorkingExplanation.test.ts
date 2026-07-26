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
  workingExplanationService: { run: vi.fn(), cancel: vi.fn() },
}))

import { apiGetAiContext, workingExplanationService } from '../api/ai.api'
import { useWorkingExplanation } from './useWorkingExplanation'
import { useAiExplanationStore } from '../stores/aiExplanation.store'
import { useSettingsStore } from '../stores/settings.store'

const mockedGetContext = apiGetAiContext as unknown as ReturnType<typeof vi.fn>
const mockedRun = workingExplanationService.run as unknown as ReturnType<typeof vi.fn>

const workingContext: AiContext = {
  diff: 'working diff',
  repoName: 'demo',
  branch: 'feat/login',
  files: [{ path: 'a.ts', status: 'modified' }],
}

beforeEach(() => {
  vi.clearAllMocks()
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

  it('passes the context and the UI language to the feature', async () => {
    useSettingsStore.setState((s) => ({ settings: { ...s.settings, language: 'fr' } }))
    const { result } = renderHook(() => useWorkingExplanation('/repo'))
    await act(async () => {
      await result.current.explain()
    })
    expect(mockedRun).toHaveBeenCalledWith(expect.anything(), {
      context: workingContext,
      language: 'fr',
    })
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
