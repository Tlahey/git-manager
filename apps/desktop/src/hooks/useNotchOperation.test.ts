import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { emptyNotchQueue, type NotchModel } from '@git-manager/notch'
import { useNotchOperation } from './useNotchOperation'
import { useNotchQueueStore } from '../stores/notchQueue.store'
import { clearNotchActions, runNotchAction } from '../lib/notifications/notchActions'

const { dismissedHandlers, unlisten } = vi.hoisted(() => ({
  dismissedHandlers: { current: [] as ((p: { notchId: string }) => void)[] },
  unlisten: vi.fn(),
}))

vi.mock('../api/notification.api', () => ({
  apiOnNotchDismissed: (handler: (p: { notchId: string }) => void) => {
    dismissedHandlers.current.push(handler)
    return Promise.resolve(unlisten)
  },
}))

function progress(ratio: number): NotchModel {
  return {
    kind: 'progress',
    id: 'commit-search:/repo',
    tone: 'running',
    eyebrow: 'SEARCHING COMMITS',
    title: 'what changed?',
    ratio,
  }
}

/** The card an ended run leaves behind — a `status`, which is the one that times out on its own. */
function outcome(): NotchModel {
  return {
    kind: 'status',
    id: 'commit-search:/repo',
    tone: 'success',
    eyebrow: 'SEARCHING COMMITS',
    title: '3 commits found',
  }
}

function current() {
  return useNotchQueueStore.getState().queue.current
}

/** Fires the dismissal the notch window emits on its way out — the ✕, a click away, a timer. */
async function reportDismissed(notchId: string) {
  await act(async () => {
    for (const handler of dismissedHandlers.current) handler({ notchId })
  })
}

/** Waits for the hook's dismissal listener to have bound — it binds through a promise. */
async function listenerBound() {
  await waitFor(() => expect(dismissedHandlers.current.length).toBeGreaterThan(0))
}

beforeEach(() => {
  dismissedHandlers.current = []
  useNotchQueueStore.setState({ queue: emptyNotchQueue })
  clearNotchActions()
})

describe('useNotchOperation', () => {
  it('puts the card on the notch as soon as there is one', () => {
    renderHook(() => useNotchOperation({ id: 'op', model: progress(0.1) }))
    expect(current()?.model.title).toBe('what changed?')
  })

  it('stamps its own id onto the card, whatever the caller’s model said', () => {
    // The queue coalesces on `model.id`, the removal matches on it and action presses are scoped
    // by it. A caller whose model id drifted would get a card that updates but never goes away.
    renderHook(() => useNotchOperation({ id: 'op', model: progress(0.1) }))
    expect(current()?.model.id).toBe('op')
  })

  it('marks a running operation as ambient, so it never becomes an OS banner', () => {
    // A clone flattened into a banner is either frozen at its first value or forty banners.
    renderHook(() => useNotchOperation({ id: 'op', model: progress(0.1) }))
    expect(current()?.importance).toBe('ambient')
  })

  it('lets a caller ask for a card worth a banner', () => {
    renderHook(() => useNotchOperation({ id: 'op', model: progress(0.1), importance: 'key' }))
    expect(current()?.importance).toBe('key')
  })

  it('carries the route a click on the card should follow', () => {
    renderHook(() =>
      useNotchOperation({
        id: 'op',
        model: progress(0.1),
        route: { kind: 'ai-run', repoPath: '/repo' },
      })
    )
    expect(current()?.route).toEqual({ kind: 'ai-run', repoPath: '/repo' })
  })

  it('leaves the route off entirely when the caller gave none', () => {
    // Absent means "nowhere to navigate"; a click still brings the app forward.
    renderHook(() => useNotchOperation({ id: 'op', model: progress(0.1) }))
    expect(current()?.route).toBeUndefined()
  })

  it('updates in place as the operation progresses', () => {
    const { rerender } = renderHook(
      ({ ratio }: { ratio: number }) => useNotchOperation({ id: 'op', model: progress(ratio) }),
      { initialProps: { ratio: 0.1 } }
    )
    rerender({ ratio: 0.8 })

    expect(useNotchQueueStore.getState().queue.pending).toHaveLength(0)
    expect(current()?.model).toMatchObject({ ratio: 0.8 })
  })

  it('does not touch the queue when nothing about the card changed', () => {
    // A model is rebuilt every render; without this guard an unrelated keystroke elsewhere would
    // push a `notch://update` at the window.
    const enqueue = vi.spyOn(useNotchQueueStore.getState(), 'enqueue')
    const { rerender } = renderHook(() => useNotchOperation({ id: 'op', model: progress(0.5) }))
    const before = enqueue.mock.calls.length
    rerender()
    rerender()

    expect(enqueue.mock.calls.length).toBe(before)
  })

  it('takes the card off when the operation ends', () => {
    const { rerender } = renderHook(
      ({ model }: { model: NotchModel | null }) => useNotchOperation({ id: 'op', model }),
      { initialProps: { model: progress(0.5) as NotchModel | null } }
    )
    rerender({ model: null })

    expect(current()).toBeNull()
  })

  it('shows nothing while disabled, and appears the moment it is enabled', () => {
    // The gate is for a card nobody asked for — a switched-off setting, a scheduled fetch. Never
    // for window focus: the AI cards are shown whether or not the app is frontmost.
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useNotchOperation({ id: 'op', model: progress(0.5), enabled }),
      { initialProps: { enabled: false } }
    )
    expect(current()).toBeNull()

    rerender({ enabled: true })
    expect(current()?.model.id).toBe('op')
  })

  it('withdraws the card when it is disabled again mid-run', () => {
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useNotchOperation({ id: 'op', model: progress(0.5), enabled }),
      { initialProps: { enabled: true } }
    )
    rerender({ enabled: false })
    expect(current()).toBeNull()
  })

  it('leaves no card pinned to the screen when its owner unmounts', () => {
    const { unmount } = renderHook(() => useNotchOperation({ id: 'op', model: progress(0.5) }))
    unmount()
    expect(current()).toBeNull()
  })
})

/**
 * A `progress` card never times out, so the ✕ is the only way to be rid of one — and the enqueue
 * effect re-runs on every tick of the model, which is what used to put it straight back.
 */
describe('useNotchOperation — a card the user closed', () => {
  it('does not come back on the next progress tick', async () => {
    const { rerender } = renderHook(
      ({ ratio }: { ratio: number }) =>
        useNotchOperation({ id: 'op', model: progress(ratio), runId: '1' }),
      { initialProps: { ratio: 0.1 } }
    )
    await listenerBound()

    await reportDismissed('op')
    // The queue itself is retired by `useNotchQueue`; here it is the producer that must not push
    // the card back in.
    act(() => {
      useNotchQueueStore.getState().remove('op')
    })

    rerender({ ratio: 0.2 })
    rerender({ ratio: 0.9 })

    expect(current()).toBeNull()
  })

  it('stays closed for the rest of the run, outcome card included', async () => {
    // Closing it is the user saying they are done with this run — not "hide the bar and tell me
    // how it went in a minute".
    const { rerender } = renderHook(
      ({ model }: { model: NotchModel }) => useNotchOperation({ id: 'op', model, runId: '1' }),
      { initialProps: { model: progress(0.4) } }
    )
    await listenerBound()

    await reportDismissed('op')
    act(() => {
      useNotchQueueStore.getState().remove('op')
    })
    rerender({ model: outcome() })

    expect(current()).toBeNull()
  })

  it('ignores a dismissal that named somebody else’s card', async () => {
    const { rerender } = renderHook(
      ({ ratio }: { ratio: number }) =>
        useNotchOperation({ id: 'repo-a', model: progress(ratio), runId: '1' }),
      { initialProps: { ratio: 0.1 } }
    )
    await listenerBound()

    await reportDismissed('repo-b')
    rerender({ ratio: 0.5 })

    expect(current()?.model).toMatchObject({ id: 'repo-a', ratio: 0.5 })
  })

  it('comes back for the next run, since that is a card about something else', async () => {
    const { rerender } = renderHook(
      ({ runId }: { runId: string }) =>
        useNotchOperation({ id: 'op', model: progress(0.1), runId }),
      { initialProps: { runId: '1' } }
    )
    await listenerBound()

    await reportDismissed('op')
    act(() => {
      useNotchQueueStore.getState().remove('op')
    })
    // Deliberately the *same* model: the question asked twice builds the same card byte for byte,
    // so the run id is the only thing that can tell the second search from the first.
    rerender({ runId: '2' })

    expect(current()?.model.id).toBe('op')
  })

  it('comes back once there is nothing left to show, for a producer with no run id', async () => {
    // The default boundary: `NotchAiRuns` has one permanent card id and no runs to number, so the
    // model going away is what has to lift the latch — or one ✕ would silence it for the session.
    const { rerender } = renderHook(
      ({ model }: { model: NotchModel | null }) => useNotchOperation({ id: 'ai-run', model }),
      { initialProps: { model: progress(0.3) as NotchModel | null } }
    )
    await listenerBound()

    await reportDismissed('ai-run')
    rerender({ model: null })
    rerender({ model: progress(0.1) })

    expect(current()?.model.id).toBe('ai-run')
  })

  it('unbinds its listener on unmount', async () => {
    const { unmount } = renderHook(() => useNotchOperation({ id: 'op', model: progress(0.5) }))
    await listenerBound()

    unmount()
    expect(unlisten).toHaveBeenCalled()
  })
})

describe('useNotchOperation — the end of a run', () => {
  it('replaces the live card with the outcome one, which is what auto-dismisses', () => {
    // `resolveNotchDurationMs` returns `null` for a `progress` card and the user's duration for a
    // `status` one: the run's last card is the only one with a timer, and it must still get there.
    const { rerender } = renderHook(
      ({ model }: { model: NotchModel }) => useNotchOperation({ id: 'op', model, runId: '1' }),
      { initialProps: { model: progress(0.9) } }
    )
    rerender({ model: outcome() })

    expect(current()?.model).toMatchObject({ kind: 'status', title: '3 commits found' })
  })
})

describe('useNotchOperation — actions', () => {
  it('runs the caller’s handler when its button is pressed', () => {
    const cancel = vi.fn()
    renderHook(() => useNotchOperation({ id: 'op', model: progress(0.5), actions: { cancel } }))

    expect(runNotchAction('cancel', { notchId: 'op' })).toBe(true)
    expect(cancel).toHaveBeenCalled()
  })

  it('ignores a press meant for someone else’s card', () => {
    // Two repositories running the same kind of operation must not cancel each other.
    const cancel = vi.fn()
    renderHook(() => useNotchOperation({ id: 'repo-a', model: progress(0.5), actions: { cancel } }))

    runNotchAction('cancel', { notchId: 'repo-b' })
    expect(cancel).not.toHaveBeenCalled()
  })

  it('always calls the latest handler, not the one from the first render', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(
      ({ handler }: { handler: () => void }) =>
        useNotchOperation({ id: 'op', model: progress(0.5), actions: { cancel: handler } }),
      { initialProps: { handler: first } }
    )
    rerender({ handler: second })

    runNotchAction('cancel', { notchId: 'op' })
    expect(second).toHaveBeenCalled()
    expect(first).not.toHaveBeenCalled()
  })

  it('does not re-register on every render', () => {
    // Re-registering would warn about a duplicate id on each frame of a minutes-long operation.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { rerender } = renderHook(() =>
      useNotchOperation({ id: 'op', model: progress(0.5), actions: { cancel: vi.fn() } })
    )
    rerender()
    rerender()

    expect(warn).not.toHaveBeenCalled()
  })

  it('unregisters on unmount, so a later press finds nobody', () => {
    const { unmount } = renderHook(() =>
      useNotchOperation({ id: 'op', model: progress(0.5), actions: { cancel: vi.fn() } })
    )
    unmount()

    expect(runNotchAction('cancel', { notchId: 'op' })).toBe(false)
  })
})
