import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appEventBus } from './appEventBus'

describe('appEventBus', () => {
  beforeEach(() => {
    // Drain any listeners left over from a failed test so suites stay isolated.
    const bus = appEventBus as unknown as { listeners: Set<unknown> }
    bus.listeners.clear()
  })

  it('notifies a subscribed listener with the event and payload', () => {
    const listener = vi.fn()
    appEventBus.subscribe(listener)
    appEventBus.notify('commit', { sha: 'abc' })
    expect(listener).toHaveBeenCalledWith('commit', { sha: 'abc' })
  })

  it('notifies an event with no payload as undefined', () => {
    const listener = vi.fn()
    appEventBus.subscribe(listener)
    appEventBus.notify('open_app')
    expect(listener).toHaveBeenCalledWith('open_app', undefined)
  })

  it('notifies every subscribed listener', () => {
    const a = vi.fn()
    const b = vi.fn()
    appEventBus.subscribe(a)
    appEventBus.subscribe(b)
    appEventBus.notify('stage', { filePath: 'x' })
    expect(a).toHaveBeenCalledWith('stage', { filePath: 'x' })
    expect(b).toHaveBeenCalledWith('stage', { filePath: 'x' })
  })

  it('unsubscribes via the returned function', () => {
    const listener = vi.fn()
    const unsubscribe = appEventBus.subscribe(listener)
    unsubscribe()
    appEventBus.notify('commit')
    expect(listener).not.toHaveBeenCalled()
  })

  it('isolates listener errors — one throwing listener does not stop others from being notified', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const throwing = vi.fn(() => {
      throw new Error('boom')
    })
    const healthy = vi.fn()
    appEventBus.subscribe(throwing)
    appEventBus.subscribe(healthy)

    expect(() => appEventBus.notify('fixup')).not.toThrow()
    expect(healthy).toHaveBeenCalledWith('fixup', undefined)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('unsubscribing one listener does not affect others', () => {
    const a = vi.fn()
    const b = vi.fn()
    const unsubA = appEventBus.subscribe(a)
    appEventBus.subscribe(b)
    unsubA()
    appEventBus.notify('unstage')
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledWith('unstage', undefined)
  })
})
