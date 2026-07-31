import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  HALO_MARGIN,
  measureCardHeight,
  NOTCH_CARD_WIDTH,
  type NotchModel,
} from '@git-manager/notch'
import { openNotchWindow, type NotchPayload } from './notchWindow'
import type { NotchRequest } from './notchDelivery'

const { trayRect, ctor, getByLabel, closeExisting, listeners, monitor, notchMetrics } = vi.hoisted(
  () => ({
    trayRect: { current: null as { x: number; y: number } | null },
    ctor: vi.fn(),
    getByLabel: vi.fn(),
    closeExisting: vi.fn(),
    listeners: { current: new Map<string, (payload?: unknown) => void>() },
    monitor: { current: null as unknown },
    notchMetrics: {
      current: null as { safeAreaTop: number; housingHalfWidth: number } | null,
    },
  })
)

vi.mock('../../api/notification.api', () => ({
  apiGetTrayIconRect: () => Promise.resolve(trayRect.current),
}))

vi.mock('@tauri-apps/api/window', () => ({
  primaryMonitor: () => Promise.resolve(monitor.current),
}))

vi.mock('./notchMetrics', () => ({
  resolveNotchMetrics: () => Promise.resolve(notchMetrics.current),
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: Object.assign(
    function (this: unknown, label: string, options: Record<string, unknown>) {
      ctor(label, options)
      return {
        once: (event: string, handler: (payload?: unknown) => void) => {
          listeners.current.set(event, handler)
        },
      }
    },
    { getByLabel }
  ),
}))

const model: NotchModel = {
  kind: 'event',
  id: 'pr-231',
  tone: 'highlight',
  eyebrow: 'MERGED',
  title: 'feat: a thing',
  actions: [{ id: 'activate', label: 'Open' }],
}

const request: NotchRequest = { model, importance: 'key', iconId: 'pr_merged' }

/** The `{ … }` object the WebviewWindow constructor was called with. */
function creationOptions(): Record<string, unknown> {
  return ctor.mock.calls[0]![1] as Record<string, unknown>
}

/** The payload decoded back out of the created window's URL. */
function createdPayload(): NotchPayload {
  const url = creationOptions().url as string
  const encoded = new URLSearchParams(url.slice(url.indexOf('?'))).get('payload')!
  return JSON.parse(encoded) as NotchPayload
}

beforeEach(() => {
  trayRect.current = { x: 1300, y: 0 }
  monitor.current = { size: { toLogical: () => ({ width: 1512 }) }, scaleFactor: 2 }
  notchMetrics.current = null
  getByLabel.mockResolvedValue(null)
  listeners.current.clear()
  ctor.mockClear()
  closeExisting.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('openNotchWindow', () => {
  it('reports failure without creating a window when the tray icon has no rect', async () => {
    // The caller's cue to fall back to a native banner — there is nothing to anchor to on Linux.
    trayRect.current = null
    await expect(openNotchWindow(request)).resolves.toBe(false)
    expect(ctor).not.toHaveBeenCalled()
  })

  it('creates the window from the model’s own measured height', async () => {
    const promise = openNotchWindow(request)
    await vi.waitFor(() => expect(ctor).toHaveBeenCalled())
    listeners.current.get('tauri://created')?.()
    await promise

    const options = creationOptions()
    expect(options.height).toBe(measureCardHeight(model) + HALO_MARGIN * 2)
    expect(options.width).toBe(NOTCH_CARD_WIDTH + HALO_MARGIN * 2)
  })

  it('measures the card with the real per-machine band height when it has one', async () => {
    notchMetrics.current = { safeAreaTop: 38, housingHalfWidth: 110 }

    const promise = openNotchWindow(request)
    await vi.waitFor(() => expect(ctor).toHaveBeenCalled())
    listeners.current.get('tauri://created')?.()
    await promise

    expect(creationOptions().height).toBe(measureCardHeight(model, 38) + HALO_MARGIN * 2)
  })

  it('carries the real per-machine geometry to the window, so it need not ask again', async () => {
    notchMetrics.current = { safeAreaTop: 38, housingHalfWidth: 110 }

    const promise = openNotchWindow(request)
    await vi.waitFor(() => expect(ctor).toHaveBeenCalled())
    listeners.current.get('tauri://created')?.()
    await promise

    const decoded = createdPayload()
    expect(decoded.bandHeight).toBe(38)
    expect(decoded.housingHalfWidth).toBe(110)
  })

  it('omits the geometry fields entirely when there is nothing to go on, rather than sending null', async () => {
    notchMetrics.current = null

    const promise = openNotchWindow(request)
    await vi.waitFor(() => expect(ctor).toHaveBeenCalled())
    listeners.current.get('tauri://created')?.()
    await promise

    const decoded = createdPayload()
    expect(decoded).not.toHaveProperty('bandHeight')
    expect(decoded).not.toHaveProperty('housingHalfWidth')
  })

  it('centres the card on the display and hangs the window a halo margin outside it', async () => {
    const promise = openNotchWindow(request)
    await vi.waitFor(() => expect(ctor).toHaveBeenCalled())
    listeners.current.get('tauri://created')?.()
    await promise

    const options = creationOptions()
    expect(options.x).toBe((1512 - NOTCH_CARD_WIDTH) / 2 - HALO_MARGIN)
    // The card's top is the tray rect's own top minus a hair; the window sits a margin above that.
    expect(options.y).toBe(-1 - HALO_MARGIN)
  })

  it('tells the window where it is, so it can animate itself without another IPC round-trip', async () => {
    const promise = openNotchWindow(request)
    await vi.waitFor(() => expect(ctor).toHaveBeenCalled())
    listeners.current.get('tauri://created')?.()
    await promise

    const decoded = createdPayload()
    expect(decoded.windowX).toBe(creationOptions().x)
    expect(decoded.windowY).toBe(creationOptions().y)
    expect(decoded.model).toEqual(model)
    expect(decoded.iconId).toBe('pr_merged')
  })

  it('strips the delivery fields, which are not the window’s business', async () => {
    // `importance` and `nativeFallback` decide *whether* and *where* this card is shown; by the
    // time a window exists those calls are made, and they have no reason to travel in a URL.
    const promise = openNotchWindow({
      ...request,
      nativeFallback: {
        title: 'Merged',
        body: 'a PR',
        route: { kind: 'rewards' },
      },
    })
    await vi.waitFor(() => expect(ctor).toHaveBeenCalled())
    listeners.current.get('tauri://created')?.()
    await promise

    const raw = creationOptions().url as string
    expect(raw).not.toContain('importance')
    expect(raw).not.toContain('nativeFallback')
  })

  it('routes to the notch window kind', async () => {
    const promise = openNotchWindow(request)
    await vi.waitFor(() => expect(ctor).toHaveBeenCalled())
    listeners.current.get('tauri://created')?.()
    await promise

    expect(creationOptions().url).toContain('window=notch')
  })

  it('is created invisible, undecorated and shadowless', async () => {
    const promise = openNotchWindow(request)
    await vi.waitFor(() => expect(ctor).toHaveBeenCalled())
    listeners.current.get('tauri://created')?.()
    await promise

    // Invisible so the card can park itself above its resting spot before the first paint; no
    // native shadow because macOS would draw it around the *window*, which is deliberately larger
    // than the card and would render as a grey rectangle in the halo's margin.
    expect(creationOptions()).toMatchObject({
      visible: false,
      shadow: false,
      decorations: false,
      transparent: true,
      alwaysOnTop: true,
      focus: false,
    })
  })

  it('replaces the card already showing rather than stacking a second window', async () => {
    getByLabel.mockResolvedValue({ close: closeExisting })
    const promise = openNotchWindow(request)
    await vi.waitFor(() => expect(ctor).toHaveBeenCalled())
    listeners.current.get('tauri://created')?.()
    await promise

    expect(closeExisting).toHaveBeenCalled()
  })

  it('falls back to a sane screen width when the monitor cannot be read', async () => {
    monitor.current = null
    const promise = openNotchWindow(request)
    await vi.waitFor(() => expect(ctor).toHaveBeenCalled())
    listeners.current.get('tauri://created')?.()
    await promise

    expect(creationOptions().x).toBe((1440 - NOTCH_CARD_WIDTH) / 2 - HALO_MARGIN)
  })

  it('reports failure when window creation itself errors', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const promise = openNotchWindow(request)
    await vi.waitFor(() => expect(ctor).toHaveBeenCalled())
    listeners.current.get('tauri://error')?.('boom')
    await expect(promise).resolves.toBe(false)
  })

  it('tells the caller when the window is gone, however it went', async () => {
    // The backstop for the card's own dismissal announcement, which travels out of a webview that
    // is being destroyed. Losing it once used to wedge the queue for the rest of the session.
    const onDestroyed = vi.fn()
    const promise = openNotchWindow(request, { onDestroyed })
    await vi.waitFor(() => expect(ctor).toHaveBeenCalled())
    listeners.current.get('tauri://created')?.()
    await promise

    expect(onDestroyed).not.toHaveBeenCalled()
    listeners.current.get('tauri://destroyed')?.()
    expect(onDestroyed).toHaveBeenCalledTimes(1)
  })

  it('registers no death watch when the caller wants none', async () => {
    const promise = openNotchWindow(request)
    await vi.waitFor(() => expect(ctor).toHaveBeenCalled())
    listeners.current.get('tauri://created')?.()
    await promise

    expect(listeners.current.has('tauri://destroyed')).toBe(false)
  })

  it('stops waiting for an event that never arrives rather than blocking the fallback forever', async () => {
    // Neither lifecycle event is guaranteed on every platform, and a caller stuck on this promise
    // would show no notification at all.
    vi.useFakeTimers()
    const promise = openNotchWindow(request)
    // Flushes the awaited imports and IPC calls without letting the timeout fire yet.
    await vi.advanceTimersByTimeAsync(0)
    expect(ctor).toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1000)
    await expect(promise).resolves.toBe(true)
  })
})
