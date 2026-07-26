import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ChangeExplanationFile } from '@git-manager/ai'

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
  changeExplanationService: { run: vi.fn(), cancel: vi.fn() },
}))

import { changeExplanationService } from '../api/ai.api'
import { useChangeExplanation } from './useChangeExplanation'
import { useSettingsStore } from '../stores/settings.store'

const mockedRun = changeExplanationService.run as unknown as ReturnType<typeof vi.fn>
const mockedCancel = changeExplanationService.cancel as unknown as ReturnType<typeof vi.fn>

const file: ChangeExplanationFile = {
  path: 'src/a.ts',
  status: 'modified',
  patch: '@@ -1 +1 @@\n-a\n+b',
  additions: 1,
  deletions: 1,
}

beforeEach(() => {
  vi.clearAllMocks()
  listeners.clear()
  mockedRun.mockResolvedValue(undefined)
})

describe('useChangeExplanation', () => {
  it('runs the feature with the file, its content and the UI language', async () => {
    useSettingsStore.setState((s) => ({ settings: { ...s.settings, language: 'fr' } }))
    const { result } = renderHook(() => useChangeExplanation())

    await act(async () => {
      await result.current.explain({ repoName: 'demo', file, fileContent: 'const a = 1' })
    })

    expect(mockedRun).toHaveBeenCalledWith(expect.anything(), {
      repoName: 'demo',
      file,
      fileContent: 'const a = 1',
      language: 'fr',
    })
  })

  it('accumulates streamed tokens into the explanation text', async () => {
    const { result } = renderHook(() => useChangeExplanation())
    await act(async () => {
      await result.current.explain({ repoName: 'demo', file })
    })

    await act(async () => {
      emit('ai:token', 'Renames ')
      emit('ai:token', '`a`')
    })
    expect(result.current.status).toBe('streaming')
    expect(result.current.text).toBe('Renames `a`')

    await act(async () => {
      emit('ai:done')
    })
    expect(result.current.status).toBe('done')
    expect(result.current.text).toBe('Renames `a`')
  })

  it('surfaces a streaming error', async () => {
    const { result } = renderHook(() => useChangeExplanation())
    await act(async () => {
      await result.current.explain({ repoName: 'demo', file })
    })
    await act(async () => {
      emit('ai:error', 'AI_PROVIDER_NOT_RUNNING')
    })
    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe('AI_PROVIDER_NOT_RUNNING')
  })

  it('reports a cancellation', async () => {
    const { result } = renderHook(() => useChangeExplanation())
    await act(async () => {
      await result.current.explain({ repoName: 'demo', file })
    })
    await act(async () => {
      await result.current.cancel()
      emit('ai:cancelled')
    })
    expect(mockedCancel).toHaveBeenCalled()
    expect(result.current.status).toBe('cancelled')
  })

  it('refuses to run on an empty patch', async () => {
    const { result } = renderHook(() => useChangeExplanation())
    await act(async () => {
      await result.current.explain({ repoName: 'demo', file: { ...file, patch: '  \n ' } })
    })
    expect(mockedRun).not.toHaveBeenCalled()
    expect(result.current.status).toBe('error')
  })

  it('reset clears the text and status back to idle', async () => {
    const { result } = renderHook(() => useChangeExplanation())
    await act(async () => {
      await result.current.explain({ repoName: 'demo', file })
    })
    await act(async () => {
      emit('ai:token', 'text')
      emit('ai:done')
    })

    act(() => {
      result.current.reset()
    })
    expect(result.current.status).toBe('idle')
    expect(result.current.text).toBe('')
  })

  it('stops listening once unmounted mid-stream', async () => {
    const { result, unmount } = renderHook(() => useChangeExplanation())
    await act(async () => {
      await result.current.explain({ repoName: 'demo', file })
    })
    unmount()
    expect(listeners.get('ai:token')?.size ?? 0).toBe(0)
  })
})
