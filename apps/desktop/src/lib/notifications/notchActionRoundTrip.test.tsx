import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { emptyNotchQueue, type FrameScheduler, type NotchModel } from '@git-manager/notch'
import { NotchWindow } from '../../app/notch/NotchWindow'
import { useNotchActionListener } from '../../hooks/useNotchActionListener'
import { useNotchOperation } from '../../hooks/useNotchOperation'
import { useNotchQueueStore } from '../../stores/notchQueue.store'
import { clearNotchActions } from './notchActions'
import type { NotchPayload } from './notchWindow'

/**
 * The whole way from a card's button to the code that owns the operation — across the window
 * boundary, which is the one seam no other test in this repository crosses.
 *
 * Every link on that path has its own unit test, and each of them passes while the button still
 * does nothing: `NotchWindow` is asserted to *emit*, `useNotchActionListener` to *dispatch* what it
 * receives, `useNotchOperation` to *run* what is dispatched — with a different mock standing in for
 * the event bus each time. What none of them can say is that the three agree on the event's name,
 * its payload's shape and the card id they match on. This mounts both windows over one bus and
 * presses the button.
 *
 * The bus is deliberately a real broadcast: `emit` reaches every listener, including the notch
 * window's own, which is exactly how Tauri behaves and is why every handler on this path is
 * id-guarded.
 */
const { bus, emitMock, listenMock } = vi.hoisted(() => {
  const bus = new Map<string, Set<(event: { payload: unknown }) => void>>()
  return {
    bus,
    emitMock: vi.fn((event: string, payload: unknown) => {
      for (const handler of bus.get(event) ?? []) handler({ payload })
      return Promise.resolve()
    }),
    listenMock: vi.fn((event: string, handler: (e: { payload: unknown }) => void) => {
      const handlers = bus.get(event) ?? new Set()
      handlers.add(handler)
      bus.set(event, handlers)
      return Promise.resolve(() => handlers.delete(handler))
    }),
  }
})

vi.mock('@tauri-apps/api/event', () => ({ emit: emitMock, listen: listenMock }))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: { getByLabel: vi.fn(() => Promise.resolve(null)) },
}))

// The presenter's sequence still runs; nothing reaches Tauri.
vi.mock('./tauriNotchHost', () => ({
  NOTCH_SOUND: 'Pop',
  resizeNotchWindow: () => Promise.resolve(),
  createTauriNotchHost: () => ({
    prepare: () => Promise.resolve(),
    show: () => Promise.resolve(),
    setY: () => Promise.resolve(),
    close: () => Promise.resolve(),
  }),
}))

/** Completes any tween in one frame — see `NotchWindow.test.tsx` for why rAF is not used here. */
const instantScheduler: FrameScheduler = {
  now: () => 0,
  request: (callback) => callback(1_000_000),
}

const NOTCH_ID = 'commit-search:/repo'

const runningSearch: NotchModel = {
  kind: 'progress',
  id: NOTCH_ID,
  tone: 'running',
  eyebrow: 'SEARCHING COMMITS',
  title: 'when did the button change?',
  ratio: 0.4,
  actions: [{ id: 'cancel', label: 'Cancel' }],
}

const payload: NotchPayload = {
  model: runningSearch,
  windowX: 510,
  windowY: -27,
}

beforeEach(() => {
  bus.clear()
  vi.clearAllMocks()
  clearNotchActions()
  useNotchQueueStore.setState({ queue: emptyNotchQueue })
})

describe('a notch action, from the card to the operation that owns it', () => {
  it('runs the producer’s handler when the card’s button is pressed', async () => {
    const cancel = vi.fn()
    renderHook(() => {
      useNotchActionListener()
      useNotchOperation({ id: NOTCH_ID, model: runningSearch, actions: { cancel } })
    })
    // The listener binds through a promise; pressing before it lands would prove nothing.
    await waitFor(() => expect(listenMock).toHaveBeenCalled())

    render(<NotchWindow {...payload} scheduler={instantScheduler} />)
    await act(async () => {
      await Promise.resolve()
    })
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1))
  })

  it('does not reach a producer whose card the press was not on', async () => {
    // Two repositories can run the same search at once; each card's button is its own.
    const cancel = vi.fn()
    renderHook(() => {
      useNotchActionListener()
      useNotchOperation({ id: 'commit-search:/other', model: runningSearch, actions: { cancel } })
    })
    await waitFor(() => expect(listenMock).toHaveBeenCalled())

    render(<NotchWindow {...payload} scheduler={instantScheduler} />)
    await act(async () => {
      await Promise.resolve()
    })
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(cancel).not.toHaveBeenCalled()
  })
})
