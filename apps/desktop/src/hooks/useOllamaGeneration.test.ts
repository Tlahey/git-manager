import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

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

vi.mock('../api/ollama.api', () => ({ apiGenerateCommitMessage: vi.fn(), apiCancelGeneration: vi.fn() }))

import { apiGenerateCommitMessage, apiCancelGeneration } from '../api/ollama.api'
import { useOllamaGeneration } from './useOllamaGeneration'

const mockedGenerate = apiGenerateCommitMessage as unknown as ReturnType<typeof vi.fn>
const mockedCancel = apiCancelGeneration as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  listeners.clear()
})

describe('useOllamaGeneration', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useOllamaGeneration('/repo'))
    expect(result.current.status).toBe('idle')
  })

  it('moves to "connecting" immediately, then "streaming" as tokens arrive', async () => {
    mockedGenerate.mockResolvedValue(undefined)
    const onToken = vi.fn()
    const onDone = vi.fn()
    const { result } = renderHook(() => useOllamaGeneration('/repo'))

    let generatePromise: Promise<void>
    act(() => {
      generatePromise = result.current.generate(onToken, onDone)
    })
    // Listeners are registered asynchronously (await listen(...)) before the connecting phase
    // fully settles — flush microtasks so the event handlers are wired before we emit.
    await act(async () => {
      await Promise.resolve()
    })

    act(() => emit('ollama:token', 'Hello'))
    expect(onToken).toHaveBeenCalledWith('Hello')
    expect(result.current.status).toBe('streaming')

    await act(async () => {
      emit('ollama:done')
      await generatePromise
    })
    expect(onDone).toHaveBeenCalledWith('Hello')
    expect(result.current.status).toBe('done')
  })

  it('accumulates multiple tokens before "done"', async () => {
    mockedGenerate.mockResolvedValue(undefined)
    const onDone = vi.fn()
    const { result } = renderHook(() => useOllamaGeneration('/repo'))

    let generatePromise: Promise<void>
    act(() => {
      generatePromise = result.current.generate(vi.fn(), onDone)
    })
    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      emit('ollama:token', 'foo ')
      emit('ollama:token', 'bar')
    })
    await act(async () => {
      emit('ollama:done')
      await generatePromise
    })

    expect(onDone).toHaveBeenCalledWith('foo bar')
  })

  it('sets status "error" and the error message on an ollama:error event', async () => {
    mockedGenerate.mockResolvedValue(undefined)
    const { result } = renderHook(() => useOllamaGeneration('/repo'))

    let generatePromise: Promise<void>
    act(() => {
      generatePromise = result.current.generate(vi.fn(), vi.fn())
    })
    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      emit('ollama:error', 'model not found')
      await generatePromise
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe('model not found')
  })

  it('sets status "cancelled" on an ollama:cancelled event', async () => {
    mockedGenerate.mockResolvedValue(undefined)
    const { result } = renderHook(() => useOllamaGeneration('/repo'))

    let generatePromise: Promise<void>
    act(() => {
      generatePromise = result.current.generate(vi.fn(), vi.fn())
    })
    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      emit('ollama:cancelled')
      await generatePromise
    })

    expect(result.current.status).toBe('cancelled')
  })

  it('sets status "error" when apiGenerateCommitMessage itself rejects', async () => {
    mockedGenerate.mockRejectedValue(new Error('backend unreachable'))
    const { result } = renderHook(() => useOllamaGeneration('/repo'))

    await act(async () => {
      await result.current.generate(vi.fn(), vi.fn())
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error).toContain('backend unreachable')
  })

  it('cleans up prior listeners from an earlier generate() call before starting a new one', async () => {
    mockedGenerate.mockResolvedValue(undefined)
    const onDoneFirst = vi.fn()
    const onDoneSecond = vi.fn()
    const { result } = renderHook(() => useOllamaGeneration('/repo'))

    await act(async () => {
      result.current.generate(onDoneFirst === onDoneFirst ? vi.fn() : vi.fn(), onDoneFirst)
      await Promise.resolve()
    })
    const firstDoneListenerCount = listeners.get('ollama:done')?.size ?? 0
    expect(firstDoneListenerCount).toBe(1)

    await act(async () => {
      result.current.generate(vi.fn(), onDoneSecond)
      await Promise.resolve()
    })
    // Still exactly one listener registered for ollama:done — the first generate's was torn down.
    expect(listeners.get('ollama:done')?.size).toBe(1)
  })

  it('cancel() calls apiCancelGeneration', async () => {
    mockedCancel.mockResolvedValue(undefined)
    const { result } = renderHook(() => useOllamaGeneration('/repo'))
    await act(async () => result.current.cancel())
    expect(mockedCancel).toHaveBeenCalledOnce()
  })
})
