import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useRemoteProgressListener } from './useRemoteProgressListener'
import { useRemoteProgressStore } from '../stores/remoteProgress.store'
import type { RemoteProgressEvent } from '../lib/tauri'

const { handlers, unlisten } = vi.hoisted(() => ({
  handlers: { current: [] as ((event: RemoteProgressEvent) => void)[] },
  unlisten: vi.fn(),
}))

vi.mock('../api/remoteProgress.api', () => ({
  apiOnRemoteProgress: (handler: (event: RemoteProgressEvent) => void) => {
    handlers.current.push(handler)
    return Promise.resolve(unlisten)
  },
}))

async function emit(event: RemoteProgressEvent) {
  await act(async () => {
    for (const handler of handlers.current) handler(event)
  })
}

beforeEach(() => {
  handlers.current = []
  vi.clearAllMocks()
  useRemoteProgressStore.setState({ operations: {} })
})

describe('useRemoteProgressListener', () => {
  it('feeds a report into the store', async () => {
    useRemoteProgressStore.getState().start('/repo', 'fetch')
    renderHook(() => useRemoteProgressListener())
    await act(async () => {})

    await emit({
      repoPath: '/repo',
      operation: 'fetch',
      phase: 'receiving',
      completed: 5,
      total: 20,
      bytes: 1024,
    })

    expect(useRemoteProgressStore.getState().operations['fetch:/repo']?.progress).toMatchObject({
      completed: 5,
      total: 20,
    })
  })

  it('routes reports to the operation they name', async () => {
    // Events are broadcast for every repository at once — several transfers can be in flight.
    const { start } = useRemoteProgressStore.getState()
    start('/a', 'fetch')
    start('/b', 'push')
    renderHook(() => useRemoteProgressListener())
    await act(async () => {})

    await emit({
      repoPath: '/b',
      operation: 'push',
      phase: 'writing',
      completed: 2,
      total: 3,
      bytes: 8,
    })

    expect(useRemoteProgressStore.getState().operations['fetch:/a']?.progress).toBeNull()
    expect(useRemoteProgressStore.getState().operations['push:/b']?.progress).not.toBeNull()
  })

  it('unbinds on unmount', async () => {
    const { unmount } = renderHook(() => useRemoteProgressListener())
    await act(async () => {})
    unmount()
    expect(unlisten).toHaveBeenCalled()
  })

  it('unbinds a subscription that arrived after the unmount', async () => {
    const { unmount } = renderHook(() => useRemoteProgressListener())
    unmount()
    await act(async () => {})
    expect(unlisten).toHaveBeenCalled()
  })
})
