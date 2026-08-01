import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { emptyNotchQueue } from '@git-manager/notch'
import { useNotchQueue } from './useNotchQueue'
import { useNotchQueueStore } from '../stores/notchQueue.store'
import { useSettingsStore } from '../stores/settings.store'
import type { NotchRequest } from '../lib/notifications/notchDelivery'

const INITIAL_SETTINGS = useSettingsStore.getState()

const { openWindow, closeWindow, emitUpdate, sendNative, dismissedHandlers, unlisten } = vi.hoisted(
  () => ({
    openWindow: vi.fn(),
    closeWindow: vi.fn(),
    emitUpdate: vi.fn(),
    sendNative: vi.fn(),
    dismissedHandlers: { current: [] as ((p: { notchId: string }) => void)[] },
    unlisten: vi.fn(),
  })
)

vi.mock('../lib/notifications/notchWindow', () => ({
  openNotchWindow: (...a: unknown[]) => openWindow(...a),
  closeNotchWindow: (...a: unknown[]) => closeWindow(...a),
}))

vi.mock('../api/notification.api', () => ({
  apiEmitNotchUpdate: (...a: unknown[]) => emitUpdate(...a),
  apiSendNativeNotification: (...a: unknown[]) => sendNative(...a),
  apiOnNotchDismissed: (handler: (p: { notchId: string }) => void) => {
    dismissedHandlers.current.push(handler)
    return Promise.resolve(unlisten)
  },
}))

function setDisplayStyle(displayStyle: 'notch' | 'native') {
  useSettingsStore.setState({
    settings: {
      ...INITIAL_SETTINGS.settings,
      notifications: { ...INITIAL_SETTINGS.settings.notifications!, displayStyle },
    },
  })
}

function request(id: string, overrides: Partial<NotchRequest> = {}): NotchRequest {
  return {
    model: { kind: 'event', id, tone: 'info', eyebrow: id.toUpperCase(), title: id },
    importance: 'key',
    ...overrides,
  }
}

function enqueue(entry: NotchRequest) {
  act(() => {
    useNotchQueueStore.getState().enqueue(entry)
  })
}

/** Fires the dismissal the notch window would emit for a card. */
async function reportDismissed(notchId: string) {
  await act(async () => {
    for (const handler of dismissedHandlers.current) handler({ notchId })
  })
}

/** Fires the backstop the opener registers on the window it created, for the nth open call. */
async function reportWindowDestroyed(callIndex = 0) {
  const options = openWindow.mock.calls[callIndex]?.[1] as { onDestroyed?: () => void } | undefined
  await act(async () => {
    options?.onDestroyed?.()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  dismissedHandlers.current = []
  useNotchQueueStore.setState({ queue: emptyNotchQueue })
  useSettingsStore.setState(INITIAL_SETTINGS)
  openWindow.mockResolvedValue(true)
})

describe('useNotchQueue — the surface decision', () => {
  // It lives here, and only here, because this is the one point every card passes through whoever
  // produced it. It used to live in `notifyUser`, which only the GitHub notifications go through —
  // so a transfer or a search card opened a notch window even for a user who had asked for banners.
  it('sends a card to a banner instead of the notch when that is what was chosen', async () => {
    setDisplayStyle('native')
    renderHook(() => useNotchQueue())
    enqueue(request('a'))

    await waitFor(() => expect(sendNative).toHaveBeenCalled())
    expect(openWindow).not.toHaveBeenCalled()
  })

  it('derives a banner for a card whose producer never supplied one', async () => {
    // The rule "every key card needs a nativeFallback" is exactly what the next producer forgets,
    // and the symptom is silence.
    setDisplayStyle('native')
    renderHook(() => useNotchQueue())
    enqueue(request('push-failed'))

    await waitFor(() => expect(sendNative).toHaveBeenCalled())
    expect(sendNative.mock.calls[0]![0]).toMatchObject({ route: { kind: 'app' } })
  })

  it('prefers the producer’s own banner when it has one', async () => {
    setDisplayStyle('native')
    const fallback = { title: '🎉 Merged', body: 'a PR', route: { kind: 'rewards' as const } }
    renderHook(() => useNotchQueue())
    enqueue(request('a', { nativeFallback: fallback }))

    await waitFor(() => expect(sendNative).toHaveBeenCalledWith(fallback))
  })

  it('drops a card the chosen surface cannot carry, and moves the queue on', async () => {
    setDisplayStyle('native')
    renderHook(() => useNotchQueue())
    enqueue({
      model: { kind: 'progress', id: 'clone', tone: 'running', eyebrow: 'CLONING', title: 'objects' },
      importance: 'ambient',
    })

    await waitFor(() => expect(useNotchQueueStore.getState().queue.current).toBeNull())
    expect(sendNative).not.toHaveBeenCalled()
    expect(openWindow).not.toHaveBeenCalled()
  })

  it('shows nothing at all when notifications are switched off', async () => {
    useSettingsStore.setState({
      settings: {
        ...INITIAL_SETTINGS.settings,
        notifications: { ...INITIAL_SETTINGS.settings.notifications!, enabled: false },
      },
    })
    renderHook(() => useNotchQueue())
    enqueue(request('a'))

    await waitFor(() => expect(useNotchQueueStore.getState().queue.current).toBeNull())
    expect(openWindow).not.toHaveBeenCalled()
    expect(sendNative).not.toHaveBeenCalled()
  })

  it('keeps going through the queue after a card was diverted to a banner', async () => {
    setDisplayStyle('native')
    renderHook(() => useNotchQueue())
    enqueue(request('a'))
    enqueue(request('b'))

    await waitFor(() => expect(sendNative).toHaveBeenCalledTimes(2))
  })
})

describe('useNotchQueue', () => {
  // A reload of the main window runs no React cleanup, and the notch is a separate OS window that
  // outlives it — so a card that was up at that moment used to stay on screen forever, owned by
  // nobody: the fresh mount starts with an empty queue and cannot recognise it as something to
  // close. Found by an e2e run where a card left by one scenario was still on screen during the
  // next one.
  it('reclaims a window orphaned by a reload of the main window', async () => {
    renderHook(() => useNotchQueue())

    await waitFor(() => expect(closeWindow).toHaveBeenCalled())
  })

  it('does not open anything just because it swept on mount', async () => {
    renderHook(() => useNotchQueue())
    await act(async () => {})

    expect(openWindow).not.toHaveBeenCalled()
  })

  it('opens a window for the card that becomes current', async () => {
    renderHook(() => useNotchQueue())
    enqueue(request('a'))

    await waitFor(() => expect(openWindow).toHaveBeenCalledTimes(1))
    expect(openWindow.mock.calls[0]![0]).toMatchObject({ model: { id: 'a' } })
  })

  it('leaves the queued card alone until the first one is done', async () => {
    renderHook(() => useNotchQueue())
    enqueue(request('a'))
    await waitFor(() => expect(openWindow).toHaveBeenCalledTimes(1))

    enqueue(request('b'))
    await act(async () => {})
    expect(openWindow).toHaveBeenCalledTimes(1)
  })

  it('promotes the next card when the window reports it dismissed itself', async () => {
    renderHook(() => useNotchQueue())
    enqueue(request('a'))
    enqueue(request('b'))
    await waitFor(() => expect(openWindow).toHaveBeenCalledTimes(1))

    await reportDismissed('a')

    await waitFor(() => expect(openWindow).toHaveBeenCalledTimes(2))
    expect(openWindow.mock.calls[1]![0]).toMatchObject({ model: { id: 'b' } })
  })

  it('ignores a dismissal naming a card the queue has already moved past', async () => {
    // Events reach every webview and a replaced card can still have one in flight; applying it
    // would retire its successor without it ever being read.
    renderHook(() => useNotchQueue())
    enqueue(request('a'))
    enqueue(request('b'))
    await waitFor(() => expect(openWindow).toHaveBeenCalledTimes(1))

    await reportDismissed('someone-else')

    expect(useNotchQueueStore.getState().queue.current?.model.id).toBe('a')
  })

  it('promotes the next card when the window dies without announcing anything', async () => {
    // The failure this backstops was total and permanent: the announcement leaves a webview that is
    // being destroyed, and losing it once left the app believing a card was still up — every
    // notification for the rest of the session waited behind a window that no longer existed.
    renderHook(() => useNotchQueue())
    enqueue(request('a'))
    enqueue(request('b'))
    await waitFor(() => expect(openWindow).toHaveBeenCalledTimes(1))

    await reportWindowDestroyed()

    await waitFor(() => expect(openWindow).toHaveBeenCalledTimes(2))
    expect(openWindow.mock.calls[1]![0]).toMatchObject({ model: { id: 'b' } })
  })

  it('ignores a window death for a card the queue has already moved past', async () => {
    // Both paths fire for an ordinary dismissal — the card announces itself, then its window dies.
    // The second must not retire whatever took its place.
    renderHook(() => useNotchQueue())
    enqueue(request('a'))
    enqueue(request('b'))
    await waitFor(() => expect(openWindow).toHaveBeenCalledTimes(1))

    await reportDismissed('a')
    await waitFor(() => expect(openWindow).toHaveBeenCalledTimes(2))

    await reportWindowDestroyed(0)

    expect(useNotchQueueStore.getState().queue.current?.model.id).toBe('b')
    expect(openWindow).toHaveBeenCalledTimes(2)
  })

  it('pushes an update in place when the same card changes, instead of reopening', async () => {
    // Reopening on every progress tick would restart the entrance animation forty times.
    renderHook(() => useNotchQueue())
    enqueue(request('clone'))
    await waitFor(() => expect(openWindow).toHaveBeenCalledTimes(1))

    enqueue(request('clone', { iconId: 'ci_success' }))
    await waitFor(() => expect(emitUpdate).toHaveBeenCalled())
    expect(openWindow).toHaveBeenCalledTimes(1)
  })

  it('closes the window when the queue empties', async () => {
    renderHook(() => useNotchQueue())
    enqueue(request('a'))
    await waitFor(() => expect(openWindow).toHaveBeenCalledTimes(1))

    await act(async () => {
      useNotchQueueStore.getState().clear()
    })

    await waitFor(() => expect(closeWindow).toHaveBeenCalled())
  })

  it('falls back to a banner and moves on when the window cannot be opened', async () => {
    // Nothing is going to dismiss a card that never appeared, so the queue has to be unstuck from
    // here or it holds that entry forever.
    openWindow.mockResolvedValue(false)
    const fallback = { title: 'Merged', body: 'a PR', route: { kind: 'rewards' as const } }
    renderHook(() => useNotchQueue())
    enqueue(request('a', { nativeFallback: fallback }))

    await waitFor(() => expect(sendNative).toHaveBeenCalledWith(fallback))
    await waitFor(() => expect(useNotchQueueStore.getState().queue.current).toBeNull())
  })

  it('drops a card a banner could not have carried, rather than degrading it', async () => {
    openWindow.mockResolvedValue(false)
    renderHook(() => useNotchQueue())
    enqueue({
      model: { kind: 'progress', id: 'clone', tone: 'running', eyebrow: 'CLONING', title: 'objects' },
      importance: 'ambient',
      nativeFallback: { title: 'x', body: 'y', route: { kind: 'rewards' } },
    })

    await waitFor(() => expect(useNotchQueueStore.getState().queue.current).toBeNull())
    expect(sendNative).not.toHaveBeenCalled()
  })

  it('shows the next card after one that failed to open', async () => {
    openWindow.mockResolvedValueOnce(false).mockResolvedValue(true)
    renderHook(() => useNotchQueue())
    enqueue(request('a'))
    enqueue(request('b'))

    await waitFor(() => expect(openWindow).toHaveBeenCalledTimes(2))
    expect(openWindow.mock.calls[1]![0]).toMatchObject({ model: { id: 'b' } })
  })

  it('survives the opener throwing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    openWindow.mockRejectedValue(new Error('no window server'))
    renderHook(() => useNotchQueue())
    enqueue(request('a'))

    await waitFor(() => expect(useNotchQueueStore.getState().queue.current).toBeNull())
  })

  it('leaves no orphan window behind when the main window goes away', async () => {
    const { unmount } = renderHook(() => useNotchQueue())
    enqueue(request('a'))
    await waitFor(() => expect(openWindow).toHaveBeenCalledTimes(1))

    unmount()

    expect(closeWindow).toHaveBeenCalled()
    expect(unlisten).toHaveBeenCalled()
  })
})
