import { describe, it, expect, vi, beforeEach } from 'vitest'

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))
vi.mock('@git-manager/ui', async () => {
  const actual = await vi.importActual<typeof import('@git-manager/ui')>('@git-manager/ui')
  return { ...actual, toast: { error: toastError, success: vi.fn() } }
})

import { reportWriteFailures } from './reportWriteFailures'

const MESSAGE = 'That change could not be saved.'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('reportWriteFailures', () => {
  it('leaves a successful action alone, result included', async () => {
    const actions = reportWriteFailures({ save: () => Promise.resolve('ok') }, MESSAGE)
    await expect(actions.save()).resolves.toBe('ok')
    expect(toastError).not.toHaveBeenCalled()
  })

  it('passes the arguments through untouched', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const actions = reportWriteFailures({ save }, MESSAGE)

    await actions.save('a', 2, { c: true })
    expect(save).toHaveBeenCalledWith('a', 2, { c: true })
  })

  /** The point of the whole module: a rejected write used to go nowhere at all. */
  it('reports a rejected write, with the cause as the detail', async () => {
    const actions = reportWriteFailures(
      { save: () => Promise.reject(new Error('disk full')) },
      MESSAGE
    )

    await expect(actions.save()).rejects.toThrow('disk full')
    expect(toastError).toHaveBeenCalledWith(MESSAGE, {
      description: expect.stringContaining('disk full'),
    })
  })

  /**
   * Reporting and handling are different jobs: the rejection is what keeps a dialog from closing on a
   * write that never landed.
   */
  it('re-throws rather than swallowing', async () => {
    const actions = reportWriteFailures({ save: () => Promise.reject(new Error('nope')) }, MESSAGE)
    await expect(actions.save()).rejects.toThrow('nope')
  })

  it('catches a guard that throws before any promise exists', () => {
    const actions = reportWriteFailures(
      {
        save: () => {
          throw new Error('no active board')
        },
      },
      MESSAGE
    )

    expect(() => actions.save()).toThrow('no active board')
    expect(toastError).toHaveBeenCalled()
  })

  /**
   * A lost race is a recoverable non-event that `withConflictToast` already turns into its own
   * message and a refresh. Reporting it here too would claim something went wrong when the board
   * simply moved on.
   */
  it('stays quiet on a board conflict', async () => {
    const conflict = Object.assign(new Error('stale'), { code: 'BOARD_CONFLICT' })
    const actions = reportWriteFailures({ save: () => Promise.reject(conflict) }, MESSAGE)

    await expect(actions.save()).rejects.toThrow('stale')
    expect(toastError).not.toHaveBeenCalled()
  })

  it('carries non-function values across unchanged', () => {
    const cards = [{ id: 'c1' }]
    const actions = reportWriteFailures({ cards, loading: false, save: vi.fn() }, MESSAGE)

    expect(actions.cards).toBe(cards)
    expect(actions.loading).toBe(false)
  })

  it('leaves a synchronous function returning a plain value alone', () => {
    const actions = reportWriteFailures({ isOpen: () => true }, MESSAGE)
    expect(actions.isOpen()).toBe(true)
  })
})
