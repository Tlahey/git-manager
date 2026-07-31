import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTauriNotchHost, NOTCH_SOUND } from './tauriNotchHost'

const { showWindow, closeWindow, setPosition, raise, clearBackdrop, playSound, calls } = vi.hoisted(
  () => {
    const calls: string[] = []
    return {
      calls,
      showWindow: vi.fn(() => {
        calls.push('show')
        return Promise.resolve()
      }),
      closeWindow: vi.fn(() => {
        calls.push('close')
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
  }
)

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ show: showWindow, close: closeWindow, setPosition }),
}))

vi.mock('../../api/notification.api', () => ({
  apiRaiseAboveMenuBar: raise,
  apiClearWindowBackdrop: clearBackdrop,
  apiPlaySystemSound: playSound,
}))

beforeEach(() => {
  calls.length = 0
  vi.clearAllMocks()
})

describe('createTauriNotchHost', () => {
  it('raises above the menu bar before clearing the backdrop', async () => {
    // Order matters: the raise is what lets the card emerge from behind the bar during the slide,
    // and it has to be in place before anything is painted.
    const host = createTauriNotchHost({ windowX: 500, withSound: false })
    await host.prepare?.()
    expect(calls).toEqual(['raise', 'clearBackdrop'])
  })

  it('moves the window vertically, holding its x still', async () => {
    const host = createTauriNotchHost({ windowX: 500, withSound: false })
    await host.setY(120)
    const position = setPosition.mock.calls[0]![0]
    expect(position.x).toBe(500)
    expect(position.y).toBe(120)
  })

  it('delegates show and close to the window itself', async () => {
    const host = createTauriNotchHost({ windowX: 0, withSound: false })
    await host.show()
    await host.close()
    expect(showWindow).toHaveBeenCalled()
    expect(closeWindow).toHaveBeenCalled()
  })

  it('chimes with the fixed notch sound when the user enabled sound', () => {
    const host = createTauriNotchHost({ windowX: 0, withSound: true })
    host.playSound?.()
    expect(playSound).toHaveBeenCalledWith(NOTCH_SOUND)
  })

  it('has no sound hook at all when the user turned sound off', () => {
    // Absent rather than a no-op, so the presenter can't chime by accident.
    const host = createTauriNotchHost({ windowX: 0, withSound: false })
    expect(host.playSound).toBeUndefined()
  })
})
