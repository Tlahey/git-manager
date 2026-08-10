import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  HALO_MARGIN,
  measureCardHeight,
  NOTCH_CARD_WIDTH,
  type NotchModel,
} from '@git-manager/notch'
import {
  closeNotchWindow,
  openNotchWindow,
  warmUpNotchWindow,
  type NotchPayload,
} from './notchWindow'
import type { NotchRequest } from './notchDelivery'

const {
  trayRect,
  ctor,
  getByLabel,
  closeExisting,
  listeners,
  monitor,
  notchMetrics,
  appWasActive,
  navigate,
  navigateFails,
  hideExisting,
  setSize,
  setPosition,
  setFocusable,
  panelled,
} = vi.hoisted(() => ({
  trayRect: { current: null as { x: number; y: number } | null },
  ctor: vi.fn(),
  getByLabel: vi.fn(),
  closeExisting: vi.fn(),
  listeners: { current: new Map<string, (payload?: unknown) => void>() },
  monitor: { current: null as unknown },
  notchMetrics: {
    current: null as { safeAreaTop: number; housingHalfWidth: number } | null,
  },
  appWasActive: { current: true },
  navigate: vi.fn(),
  navigateFails: { current: false },
  hideExisting: vi.fn(),
  setSize: vi.fn(),
  setPosition: vi.fn(),
  setFocusable: vi.fn(),
  panelled: { current: false },
}))

vi.mock('../../api/notification.api', () => ({
  apiGetTrayIconRect: () => Promise.resolve(trayRect.current),
  apiIsAppActive: () => Promise.resolve(appWasActive.current),
  apiMakeNotchWindowNonactivating: () => Promise.resolve(panelled.current),
  apiNavigateWindow: (label: string, url: string) => {
    navigate(label, url)
    return navigateFails.current ? Promise.reject(new Error('boom')) : Promise.resolve()
  },
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
  // Creating a window is only permitted while the app is frontmost — it activates the whole
  // application, which is the bug this module exists to avoid. The refusal is asserted on its own
  // below; every other test here is about what creation does once it is allowed.
  appWasActive.current = true
  navigate.mockClear()
  navigateFails.current = false
  hideExisting.mockClear()
  setSize.mockClear()
  setPosition.mockClear()
  setFocusable.mockClear()
  // The experiment is off in every ordinary build; the opt-in case is asserted on its own.
  panelled.current = false
})

/** The parked notch window: what `getByLabel` hands back once one exists. */
function parkedWindow() {
  return {
    setSize,
    setPosition,
    setFocusable,
    hide: hideExisting,
    close: closeExisting,
    once: (event: string, handler: (payload?: unknown) => void) => {
      listeners.current.set(event, handler)
    },
  }
}

/** The `payload` of the URL the parked window was navigated to. */
function navigatedPayload(): NotchPayload {
  const url = navigate.mock.calls[0]![1] as string
  return JSON.parse(new URL(url).searchParams.get('payload')!) as NotchPayload
}

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

  it('accepts the first click, so a button press is not spent activating the app', async () => {
    // A card is only ever raised while the user is in another application, and the click that
    // reaches a background app's window is consumed activating it rather than delivered to the view
    // under the cursor — unless that view opts in. Without this the Cancel button did nothing.
    const promise = openNotchWindow(request)
    await vi.waitFor(() => expect(ctor).toHaveBeenCalled())
    listeners.current.get('tauri://created')?.()
    await promise

    expect(creationOptions().acceptFirstMouse).toBe(true)
  })

  it('can never become the key window, so closing a card cannot hand focus to the app', async () => {
    // tao maps `focusable` onto both `canBecomeKeyWindow` and `canBecomeMainWindow`. Left at its
    // default, clicking the ✕ made this window key — and hiding it is `orderOut:`, which hands key
    // status to the next window of the same application rather than dropping it. That window is the
    // main one, so dismissing a notification pulled the user out of whatever they were doing.
    const promise = openNotchWindow(request)
    await vi.waitFor(() => expect(ctor).toHaveBeenCalled())
    listeners.current.get('tauri://created')?.()
    await promise

    expect(creationOptions().focusable).toBe(false)
  })

  // ── the parked window ──────────────────────────────────────────────────────────────────────
  // Creating a webview activates the whole application on macOS, whatever the window options say,
  // so a card must never be the thing that creates one. These are the assertions that keep it that
  // way; each of them is the bug coming back if it flips.

  it('navigates the parked window instead of creating a second one', async () => {
    getByLabel.mockResolvedValue(parkedWindow())

    await expect(openNotchWindow(request)).resolves.toBe(true)

    expect(ctor).not.toHaveBeenCalled()
    expect(closeExisting).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate.mock.calls[0]![0]).toBe('notch')
    expect(navigate.mock.calls[0]![1]).toContain('window=notch')
  })

  it('carries the same payload through the URL as a freshly created window would', async () => {
    getByLabel.mockResolvedValue(parkedWindow())
    notchMetrics.current = { safeAreaTop: 38, housingHalfWidth: 110 }

    await openNotchWindow(request)

    const decoded = navigatedPayload()
    expect(decoded.model).toEqual(model)
    expect(decoded.iconId).toBe('pr_merged')
    expect(decoded.bandHeight).toBe(38)
    expect(decoded.windowY).toBe(-1 - HALO_MARGIN)
  })

  it('re-asserts that the parked window cannot become key, on every card', async () => {
    // Not merely a creation option. This window is made once and reused for the life of the app, so
    // a creation-time setting only describes the window some particular launch built — a frontend
    // reload leaves the old one standing, which is how the first attempt at this fix reached
    // nobody. Without it, hiding a dismissed card hands key status to the main window and pulls the
    // app in front of the user.
    getByLabel.mockResolvedValue(parkedWindow())

    await openNotchWindow(request)

    expect(setFocusable).toHaveBeenCalledWith(false)
  })

  it('never calls setFocusable on a window that became a nonactivating panel', async () => {
    // Not a preference: a panel's class has no `focusable` ivar, and `setFocusable` writes that
    // ivar by name — so calling it there would abort the process rather than misbehave.
    panelled.current = true
    getByLabel.mockResolvedValue(parkedWindow())

    await openNotchWindow(request)

    expect(setFocusable).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it('places and sizes the parked window before its content arrives', async () => {
    // The page measures its own slide against the `windowY` in its payload, so it has to find the
    // window already where that says it is.
    getByLabel.mockResolvedValue(parkedWindow())

    await openNotchWindow(request)

    expect(setSize).toHaveBeenCalled()
    expect(setPosition).toHaveBeenCalled()
    const sizeCall = setSize.mock.invocationCallOrder[0]!
    const navigateCall = navigate.mock.invocationCallOrder[0]!
    expect(sizeCall).toBeLessThan(navigateCall)
  })

  it('falls back to opening a window when the parked one cannot be reused', async () => {
    // A card shown rudely still beats no card — and unlike the `show()` fallbacks this one only
    // costs focus once the cheap path is already broken.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    getByLabel.mockResolvedValue(parkedWindow())
    navigateFails.current = true

    const promise = openNotchWindow(request)
    await vi.waitFor(() => expect(ctor).toHaveBeenCalled())
    listeners.current.get('tauri://created')?.()

    await expect(promise).resolves.toBe(true)
    // The window in the way has to be closed first: a label is unique, so creating one on a label
    // that still exists fails outright. Without this the "fallback" reports failure, and the
    // queue's own last resort is a macOS banner — which is how a user who chose the notch ends up
    // with a system notification instead.
    expect(closeExisting).toHaveBeenCalled()
    expect(closeExisting.mock.invocationCallOrder[0]!).toBeLessThan(
      ctor.mock.invocationCallOrder[0]!
    )
  })

  it('reports failure rather than a half-open notch when the window in the way will not close', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    getByLabel.mockResolvedValue({
      ...parkedWindow(),
      close: vi.fn(() => Promise.reject(new Error('stuck'))),
    })
    navigateFails.current = true

    await expect(openNotchWindow(request)).resolves.toBe(false)
    expect(ctor).not.toHaveBeenCalled()
  })

  it('parks the window on the way out rather than destroying it', async () => {
    getByLabel.mockResolvedValue(parkedWindow())

    await closeNotchWindow()

    expect(hideExisting).toHaveBeenCalled()
    expect(closeExisting).not.toHaveBeenCalled()
    // Navigated back to the empty card, so the last one isn't left mounted answering updates.
    expect(navigate.mock.calls[0]![1]).not.toContain('payload=')
  })

  it('warms up one window at startup, and only one', async () => {
    const promise = warmUpNotchWindow()
    await vi.waitFor(() => expect(ctor).toHaveBeenCalled())
    listeners.current.get('tauri://created')?.()
    await promise

    // Parked, i.e. no card in it: `main.tsx` renders nothing for this and leaves it alone.
    expect(creationOptions().url).toBe('/?window=notch')
    expect(creationOptions().visible).toBe(false)

    ctor.mockClear()
    getByLabel.mockResolvedValue(parkedWindow())
    await warmUpNotchWindow()
    expect(ctor).not.toHaveBeenCalled()
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

  it('does not tell a caller that wanted no backstop', async () => {
    // The watch itself is registered once for the window's whole life — one per card would pile up
    // a never-firing IPC listener per notification, now that the window outlives them all. What is
    // per-card is who it reports to.
    const onDestroyed = vi.fn()
    const first = openNotchWindow(request, { onDestroyed })
    await vi.waitFor(() => expect(ctor).toHaveBeenCalled())
    listeners.current.get('tauri://created')?.()
    await first

    getByLabel.mockResolvedValue(parkedWindow())
    await openNotchWindow(request)

    listeners.current.get('tauri://destroyed')?.()
    expect(onDestroyed).not.toHaveBeenCalled()
  })

  it('reports a death to the card that is on the window now, not the one that created it', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const promise = openNotchWindow(request, { onDestroyed: first })
    await vi.waitFor(() => expect(ctor).toHaveBeenCalled())
    listeners.current.get('tauri://created')?.()
    await promise

    getByLabel.mockResolvedValue(parkedWindow())
    await openNotchWindow(request, { onDestroyed: second })

    listeners.current.get('tauri://destroyed')?.()
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })

  it('refuses to create a window while the app is in the background', async () => {
    // Creating a webview activates the whole application, with nothing to gate it and no reliable
    // way to undo it — handing the activation back afterwards was shipped and still visibly stole
    // the window. So no card is created rather than one that takes the user's keyboard.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    appWasActive.current = false

    await expect(openNotchWindow(request)).resolves.toBe(false)
    expect(ctor).not.toHaveBeenCalled()
  })

  it('still reuses the parked window while the app is in the background', async () => {
    // Which is the whole point: navigating touches no NSApplication, so the one moment a card is
    // actually wanted is the one moment it works.
    appWasActive.current = false
    getByLabel.mockResolvedValue(parkedWindow())

    await expect(openNotchWindow(request)).resolves.toBe(true)
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(ctor).not.toHaveBeenCalled()
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
