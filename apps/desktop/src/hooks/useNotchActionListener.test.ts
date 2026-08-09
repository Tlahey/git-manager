import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useNotchActionListener } from './useNotchActionListener'
import {
  clearNotchActions,
  registerNotchAction,
  type NotchActionContext,
} from '../lib/notifications/notchActions'

const { handlers, unlisten } = vi.hoisted(() => ({
  handlers: { current: [] as ((p: { actionId: string; notchId: string }) => void)[] },
  unlisten: vi.fn(),
}))

vi.mock('../api/notification.api', () => ({
  apiOnNotchAction: (handler: (p: { actionId: string; notchId: string }) => void) => {
    handlers.current.push(handler)
    return Promise.resolve(unlisten)
  },
}))

/** Fires the event the notch window emits for an action it can't perform itself. */
async function emitAction(actionId: string, notchId = 'hook-pre-commit') {
  await act(async () => {
    for (const handler of handlers.current) handler({ actionId, notchId })
  })
}

beforeEach(() => {
  handlers.current = []
  clearNotchActions()
  vi.clearAllMocks()
})

describe('useNotchActionListener', () => {
  it('hands an action to the handler that registered for it', async () => {
    const received: NotchActionContext[] = []
    registerNotchAction('retry', (context) => received.push(context))
    renderHook(() => useNotchActionListener())

    await emitAction('retry', 'hook-pre-commit')

    expect(received).toEqual([{ notchId: 'hook-pre-commit' }])
  })

  it('says out loud when a card offered a button nobody handles', async () => {
    // Without this the button just does nothing, silently, and reads as a rendering bug rather
    // than as a producer that forgot to register its handler.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    renderHook(() => useNotchActionListener())

    await emitAction('show-output')

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('show-output'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no handler'))
  })

  it('stays quiet when the action was handled', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    registerNotchAction('retry', vi.fn())
    renderHook(() => useNotchActionListener())

    await emitAction('retry')

    expect(warn).not.toHaveBeenCalled()
  })

  it('unbinds on unmount', async () => {
    const { unmount } = renderHook(() => useNotchActionListener())
    // Binding is async; unmounting before it resolves takes the other branch (tested below).
    await act(async () => {})
    unmount()
    expect(unlisten).toHaveBeenCalled()
  })

  it('unbinds a subscription that arrived after the unmount', async () => {
    // The listener binds through a promise, so a component that mounts and unmounts inside one
    // tick would otherwise leave a live subscription behind with nothing holding its handle.
    const { unmount } = renderHook(() => useNotchActionListener())
    unmount()
    await act(async () => {})
    expect(unlisten).toHaveBeenCalled()
  })
})
