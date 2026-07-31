/**
 * The seam between the card and whatever is actually carrying it on screen.
 *
 * This is the one decision the whole package is built around. The card used to call
 * `getCurrentWindow().setPosition(...)`, `apiRaiseAboveMenuBar()` and `getCurrentWindow().close()`
 * directly, which meant it could only ever exist inside a live Tauri webview — no Storybook, no
 * jsdom, no way to look at it without building and launching the app and then provoking a real
 * GitHub event.
 *
 * Everything the card needs from its container is these four calls. The desktop app implements
 * them against a `WebviewWindow`; Storybook implements them against a positioned `<div>` inside a
 * fake MacBook screen; a test implements them as an array of recorded calls.
 */
export interface NotchHost {
  /** Reveals the surface. Called once, after {@link NotchHost.setY} has parked it off-screen. */
  show(): Promise<void> | void
  /** Moves the surface's top edge, in the host's own coordinate space. */
  setY(y: number): Promise<void> | void
  /** Tears the surface down for good — the card is not reused after this. */
  close(): Promise<void> | void
  /**
   * Runs before the surface is revealed, for whatever native preparation the host needs (raising
   * above the menu bar, clearing the webview backdrop). Best-effort by contract: the presenter
   * catches anything thrown here, because a card that never appears is far worse than one that
   * appears under the menu bar.
   */
  prepare?(): Promise<void> | void
  /** Optional chime as the card lands. */
  playSound?(): void
}

/** A host that does nothing, for tests that only care about the card's markup. */
export const noopNotchHost: NotchHost = {
  show() {},
  setY() {},
  close() {},
}

/**
 * A host backed by an absolutely-positioned DOM element — what Storybook and the in-app preview
 * use. `element` is a getter rather than the node itself so the host survives React remounting the
 * card underneath it.
 */
export function createElementNotchHost(options: {
  element: () => HTMLElement | null
  onClose: () => void
}): NotchHost {
  return {
    show() {
      const element = options.element()
      if (element) element.style.visibility = 'visible'
    },
    setY(y) {
      const element = options.element()
      if (element) element.style.top = `${y}px`
    },
    close() {
      options.onClose()
    },
  }
}

/** A host that records every call, for asserting the enter/exit sequence in tests. */
export function createRecordingNotchHost(): NotchHost & { calls: string[]; positions: number[] } {
  const calls: string[] = []
  const positions: number[] = []
  return {
    calls,
    positions,
    prepare() {
      calls.push('prepare')
    },
    show() {
      calls.push('show')
    },
    setY(y) {
      calls.push('setY')
      positions.push(y)
    },
    close() {
      calls.push('close')
    },
    playSound() {
      calls.push('playSound')
    },
  }
}
