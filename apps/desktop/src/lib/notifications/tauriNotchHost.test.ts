import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTauriNotchHost, NOTCH_SOUND } from './tauriNotchHost'

const {
  showWindow,
  showWithoutActivating,
  closeWindow,
  hideWindow,
  setPosition,
  raise,
  clearBackdrop,
  playSound,
  calls,
} = vi.hoisted(() => {
  const calls: string[] = []
  return {
    calls,
    showWindow: vi.fn(() => {
      calls.push('show')
      return Promise.resolve()
    }),
    showWithoutActivating: vi.fn(() => {
      calls.push('showWithoutActivating')
      return Promise.resolve()
    }),
    closeWindow: vi.fn(() => {
      calls.push('close')
      return Promise.resolve()
    }),
    hideWindow: vi.fn(() => {
      calls.push('hide')
      return Promise.resolve()
    }),
    // Typed parameter on purpose: an untyped `vi.fn(() => …)` gives `mock.calls` an empty tuple
    // type, so reading the position back out fails to compile.
    setPosition: vi.fn((_position: { x: number; y: number }) => {
      calls.push('setPosition')
      return Promise.resolve()
    }),
    raise: vi.fn(() => {
      calls.push('raise')
      return Promise.resolve()
    }),
    clearBackdrop: vi.fn(() => {
      calls.push('clearBackdrop')
      return Promise.resolve()
    }),
    playSound: vi.fn(),
  }
})

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ show: showWindow, close: closeWindow, hide: hideWindow, setPosition }),
}))

vi.mock('../../api/notification.api', () => ({
  apiRaiseAboveMenuBar: raise,
  apiClearWindowBackdrop: clearBackdrop,
  apiPlaySystemSound: playSound,
  apiShowWithoutActivating: showWithoutActivating,
}))

beforeEach(() => {
  calls.length = 0
  vi.clearAllMocks()
})

/** A stand-in for the element the card is drawn in, which the host moves by transform. */
function surfaceRef(): { current: HTMLElement | null } {
  return { current: document.createElement('div') }
}

describe('createTauriNotchHost', () => {
  it('raises above the menu bar before clearing the backdrop', async () => {
    // Order matters: the raise is what lets the card emerge from behind the bar during the slide,
    // and it has to be in place before anything is painted.
    const host = createTauriNotchHost({ restY: 0, surface: surfaceRef(), withSound: false })
    await host.prepare?.()
    expect(calls).toEqual(['raise', 'clearBackdrop'])
  })

  // The card moves inside a window that stays put. Animating the window itself is what the notch
  // used to do, and it could not survive the card having to travel its own full height: macOS
  // refuses to place a window entirely above the top of the screen, so the card never appeared.
  it('moves the card inside the window, as an offset from its resting spot', async () => {
    const surface = surfaceRef()
    const host = createTauriNotchHost({ restY: 100, surface, withSound: false })

    await host.setY(100)
    expect(surface.current!.style.transform).toBe('translateY(0px)')

    await host.setY(40)
    expect(surface.current!.style.transform).toBe('translateY(-60px)')
  })

  it('never moves the window itself', async () => {
    const host = createTauriNotchHost({ restY: 100, surface: surfaceRef(), withSound: false })
    await host.setY(40)
    expect(setPosition).not.toHaveBeenCalled()
  })

  it('survives a frame that lands before the surface is mounted', async () => {
    // The presenter parks the card before the first paint; a null ref must not throw and lose the
    // whole entrance.
    const host = createTauriNotchHost({ restY: 100, surface: { current: null }, withSound: false })
    await expect(host.setY(40)).resolves.toBeUndefined()
  })

  // Hidden, never closed: the window outlives every card, because *creating* a webview activates
  // the whole application on macOS and the next card would pay for it.
  it('hides the window on the way out rather than destroying it', async () => {
    const host = createTauriNotchHost({ restY: 0, surface: surfaceRef(), withSound: false })
    await host.close()
    expect(hideWindow).toHaveBeenCalled()
    expect(closeWindow).not.toHaveBeenCalled()
  })

  // The whole point of the card: it can arrive while the user is typing in another app and must
  // not take the keyboard away from them. `WebviewWindow.show()` would — it makes the window key
  // on macOS and brings the application forward with it.
  it('reveals the card without activating the app', async () => {
    const host = createTauriNotchHost({ restY: 0, surface: surfaceRef(), withSound: false })
    await host.show()
    expect(showWithoutActivating).toHaveBeenCalled()
    expect(showWindow).not.toHaveBeenCalled()
  })

  it('chimes with the fixed notch sound when the user enabled sound', () => {
    const host = createTauriNotchHost({ restY: 0, surface: surfaceRef(), withSound: true })
    host.playSound?.()
    expect(playSound).toHaveBeenCalledWith(NOTCH_SOUND)
  })

  it('has no sound hook at all when the user turned sound off', () => {
    // Absent rather than a no-op, so the presenter can't chime by accident.
    const host = createTauriNotchHost({ restY: 0, surface: surfaceRef(), withSound: false })
    expect(host.playSound).toBeUndefined()
  })
})
