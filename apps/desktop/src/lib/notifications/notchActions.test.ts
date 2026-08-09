import { describe, it, expect, vi, beforeEach } from 'vitest'
import { clearNotchActions, registerNotchAction, runNotchAction } from './notchActions'

beforeEach(() => {
  clearNotchActions()
})

describe('runNotchAction', () => {
  it('calls the handler with the card the button was on', () => {
    const handler = vi.fn()
    registerNotchAction('retry', handler)

    expect(runNotchAction('retry', { notchId: 'hook-pre-commit' })).toBe(true)
    expect(handler).toHaveBeenCalledWith({ notchId: 'hook-pre-commit' })
  })

  it('reports that nobody was listening, rather than failing silently', () => {
    // The failure this exists to surface: a producer ships a button and forgets to register its
    // handler, so pressing it does nothing and looks like a rendering bug.
    expect(runNotchAction('show-output', { notchId: 'hook' })).toBe(false)
  })

  it('does not let a throwing handler take down the caller', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    registerNotchAction('boom', () => {
      throw new Error('nope')
    })

    expect(runNotchAction('boom', { notchId: 'x' })).toBe(true)
    expect(error).toHaveBeenCalled()
  })

  it('routes each id to its own handler', () => {
    const retry = vi.fn()
    const cancel = vi.fn()
    registerNotchAction('retry', retry)
    registerNotchAction('cancel', cancel)

    runNotchAction('cancel', { notchId: 'clone' })

    expect(cancel).toHaveBeenCalled()
    expect(retry).not.toHaveBeenCalled()
  })
})

describe('registerNotchAction', () => {
  it('unregisters through the function it returns', () => {
    const handler = vi.fn()
    const unregister = registerNotchAction('retry', handler)
    unregister()

    expect(runNotchAction('retry', { notchId: 'x' })).toBe(false)
  })

  it('does not let a stale unregister remove the handler that replaced it', () => {
    const first = vi.fn()
    const second = vi.fn()
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const unregisterFirst = registerNotchAction('retry', first)
    registerNotchAction('retry', second)
    unregisterFirst()

    expect(runNotchAction('retry', { notchId: 'x' })).toBe(true)
    expect(second).toHaveBeenCalled()
  })

  it('warns when two features claim the same id, but keeps working', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    registerNotchAction('retry', vi.fn())
    registerNotchAction('retry', vi.fn())

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('already registered'))
  })
})
