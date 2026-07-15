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
  prDescriptionService: { run: vi.fn(), cancel: vi.fn() },
}))

import { apiGetAiContext, prDescriptionService } from '../api/ai.api'
import { usePrDescriptionGeneration } from './usePrDescriptionGeneration'

const mockedGetContext = apiGetAiContext as unknown as ReturnType<typeof vi.fn>
const mockedRun = prDescriptionService.run as unknown as ReturnType<typeof vi.fn>

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
    expect(mockedRun).toHaveBeenCalledWith(expect.anything(), {
      context: rangeContext,
      templateContent: '## Template',
    })

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
