import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AiConnectionConfig } from '@git-manager/ai'

vi.mock('../api/ai.api', () => ({ aiStatusService: { check: vi.fn() } }))

import { aiStatusService } from '../api/ai.api'
import { useAiStatusStore } from './aiStatus.store'

const mockedCheck = aiStatusService.check as unknown as ReturnType<typeof vi.fn>
const INITIAL = useAiStatusStore.getState()

const connection: AiConnectionConfig = {
  preset: 'ollama',
  url: 'http://localhost:11434',
  model: 'llama3.2',
  timeoutSeconds: 30,
}

beforeEach(() => {
  vi.clearAllMocks()
  useAiStatusStore.setState(INITIAL, true)
})

describe('useAiStatusStore.check', () => {
  it('starts from an unknown state with no models', () => {
    expect(useAiStatusStore.getState()).toMatchObject({
      state: 'unknown',
      models: [],
      lastCheckedAt: null,
    })
  })

  it('stores the reported models and flips to connected', async () => {
    mockedCheck.mockResolvedValue({ connected: true, models: ['llama3.2', 'mistral'] })
    await useAiStatusStore.getState().check(connection)

    expect(useAiStatusStore.getState()).toMatchObject({
      state: 'connected',
      models: ['llama3.2', 'mistral'],
    })
    expect(useAiStatusStore.getState().lastCheckedAt).toBeTypeOf('number')
  })

  it('flips to disconnected when the provider answers negatively', async () => {
    mockedCheck.mockResolvedValue({ connected: false, models: [] })
    await useAiStatusStore.getState().check(connection)
    expect(useAiStatusStore.getState().state).toBe('disconnected')
  })

  it('keeps the transport diagnostic so the UI can say why', async () => {
    mockedCheck.mockResolvedValue({
      connected: false,
      models: [],
      detail: 'GET http://localhost:8000/v1/models → HTTP 404',
    })
    await useAiStatusStore.getState().check(connection)
    expect(useAiStatusStore.getState().detail).toBe(
      'GET http://localhost:8000/v1/models → HTTP 404'
    )
  })

  it('clears a previous diagnostic once the provider answers', async () => {
    mockedCheck.mockResolvedValue({ connected: false, models: [], detail: 'GET … → HTTP 404' })
    await useAiStatusStore.getState().check(connection)

    mockedCheck.mockResolvedValue({ connected: true, models: ['llama3.2'] })
    await useAiStatusStore.getState().check(connection)
    expect(useAiStatusStore.getState().detail).toBeNull()
  })

  it('swallows a thrown transport error into a disconnected state', async () => {
    mockedCheck.mockRejectedValue(new Error('connection refused'))
    await useAiStatusStore.getState().check(connection)

    expect(useAiStatusStore.getState().state).toBe('disconnected')
    // A thrown command is the one path with no transport diagnostic — keep its message instead.
    expect(useAiStatusStore.getState().detail).toBe('connection refused')
  })

  it('exposes a checking state while the call is in flight', async () => {
    let resolveCheck: (value: unknown) => void = () => {}
    mockedCheck.mockReturnValue(new Promise((resolve) => (resolveCheck = resolve)))

    const pending = useAiStatusStore.getState().check(connection)
    expect(useAiStatusStore.getState().state).toBe('checking')

    resolveCheck({ connected: true, models: [] })
    await pending
    expect(useAiStatusStore.getState().state).toBe('connected')
  })

  it('ignores a stale result when a newer check has already been started', async () => {
    let resolveSlow: (value: unknown) => void = () => {}
    mockedCheck.mockReturnValueOnce(new Promise((resolve) => (resolveSlow = resolve)))
    mockedCheck.mockResolvedValueOnce({ connected: true, models: ['fresh'] })

    const slow = useAiStatusStore.getState().check(connection)
    await useAiStatusStore.getState().check({ ...connection, url: 'http://localhost:1234' })

    resolveSlow({ connected: false, models: [] })
    await slow

    expect(useAiStatusStore.getState()).toMatchObject({
      state: 'connected',
      models: ['fresh'],
    })
  })
})

describe('useAiStatusStore.reset', () => {
  it('clears the stored outcome', async () => {
    mockedCheck.mockResolvedValue({ connected: true, models: ['llama3.2'] })
    await useAiStatusStore.getState().check(connection)

    useAiStatusStore.getState().reset()
    expect(useAiStatusStore.getState()).toMatchObject({
      state: 'unknown',
      models: [],
      detail: null,
      lastCheckedAt: null,
    })
  })

  it('prevents an in-flight check from landing after it', async () => {
    let resolveCheck: (value: unknown) => void = () => {}
    mockedCheck.mockReturnValue(new Promise((resolve) => (resolveCheck = resolve)))

    const pending = useAiStatusStore.getState().check(connection)
    useAiStatusStore.getState().reset()

    resolveCheck({ connected: true, models: ['llama3.2'] })
    await pending

    expect(useAiStatusStore.getState().state).toBe('unknown')
  })
})
