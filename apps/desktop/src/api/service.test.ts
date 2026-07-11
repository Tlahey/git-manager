import { describe, it, expect, vi } from 'vitest'
import { callCommand } from './service'
import { appEventBus } from '../lib/appEventBus'

describe('callCommand', () => {
  it('runs the operation and returns its result', async () => {
    const fn = vi.fn().mockResolvedValue('result')
    const result = await callCommand('commit', fn)
    expect(result).toBe('result')
    expect(fn).toHaveBeenCalledOnce()
  })

  it('notifies appEventBus with the event and payload after the operation succeeds', async () => {
    const listener = vi.fn()
    const unsubscribe = appEventBus.subscribe(listener)
    await callCommand('stage', () => Promise.resolve(undefined), { filePath: 'a.ts' })
    unsubscribe()
    expect(listener).toHaveBeenCalledWith('stage', { filePath: 'a.ts' })
  })

  it('notifies with undefined payload when none is given', async () => {
    const listener = vi.fn()
    const unsubscribe = appEventBus.subscribe(listener)
    await callCommand('discard', () => Promise.resolve(undefined))
    unsubscribe()
    expect(listener).toHaveBeenCalledWith('discard', undefined)
  })

  it('does not notify when the operation rejects, and propagates the error', async () => {
    const listener = vi.fn()
    const unsubscribe = appEventBus.subscribe(listener)
    const fn = vi.fn().mockRejectedValue(new Error('backend failed'))

    await expect(callCommand('commit', fn)).rejects.toThrow(Error)

    unsubscribe()
    expect(listener).not.toHaveBeenCalled()
  })

  it('notifies only after the operation resolves, not before', async () => {
    const order: string[] = []
    const listener = vi.fn(() => order.push('notified'))
    const unsubscribe = appEventBus.subscribe(listener)
    const fn = vi.fn().mockImplementation(async () => {
      order.push('fn-called')
      return 'ok'
    })

    await callCommand('fixup', fn)

    unsubscribe()
    expect(order).toEqual(['fn-called', 'notified'])
  })
})
