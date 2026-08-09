import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { initI18n, i18next } from '@git-manager/i18n'

// Initialize i18n in English for the whole test run. Components under test then render the real
// (source-locale) copy through `t()` — including interpolated values — so assertions verify the
// actual user-visible text and injected content, NOT raw translation keys. `resources` are inline
// in @git-manager/i18n, so init resolves synchronously and `t()` returns strings on first render.
// For special cases needing another language, use `renderWithLanguage()` from `src/test/i18n.tsx`.
initI18n('en')

// Testing-library's automatic between-test cleanup only kicks in when vitest runs with
// `globals: true` (it looks for a global `afterEach`), which this config doesn't use — without
// this explicit hook, every `render()` accumulates into the same jsdom document across tests,
// so `screen` queries start matching stale duplicates from earlier tests in the file.
afterEach(() => {
  cleanup()
  // Reset language so a test that switched to another locale (via renderWithLanguage) doesn't
  // leak into the next test — the global default for assertions is English.
  if (i18next.language !== 'en') i18next.changeLanguage('en')
})

// jsdom doesn't implement ResizeObserver — ThreeWayMergeEditor observes its outer container to
// recompute connector geometry on resize. Tests don't need real resize behavior, just a stub
// that doesn't throw.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub

// jsdom doesn't implement IntersectionObserver — the Launchpad's infinite-scroll sentinel observes a
// bottom marker to lazy-load more rows. This stub records every instance (and the elements it
// observes) so tests can drive intersection deterministically via `trigger()`; it never fires on its
// own, and `instances.at(-1)` is always the most recently mounted sentinel's observer.
class IntersectionObserverStub {
  static instances: IntersectionObserverStub[] = []
  private callback: IntersectionObserverCallback
  elements: Element[] = []
  constructor(cb: IntersectionObserverCallback) {
    this.callback = cb
    IntersectionObserverStub.instances.push(this)
  }
  observe(el: Element) {
    this.elements.push(el)
  }
  unobserve(el: Element) {
    this.elements = this.elements.filter((e) => e !== el)
  }
  disconnect() {
    this.elements = []
  }
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
  /** Test-only: simulate the observed element(s) scrolling into (or out of) view. */
  trigger(isIntersecting = true) {
    this.callback(
      this.elements.map((target) => ({ isIntersecting, target }) as IntersectionObserverEntry),
      this as unknown as IntersectionObserver
    )
  }
}
globalThis.IntersectionObserver ??=
  IntersectionObserverStub as unknown as typeof IntersectionObserver

// jsdom doesn't implement scrollIntoView — cmdk (the Command list backing the command palette and
// settings' provider combobox) calls it unconditionally on mount/selection to keep the highlighted
// item in view, with no optional chaining we can rely on since it's third-party code.
Element.prototype.scrollIntoView ??= () => {}

// jsdom implements no pointer capture at all — Radix's Select trigger (the board's card-kind picker)
// calls `hasPointerCapture` on every pointerdown and throws without it, so the menu could not be
// opened from a test. Capture is a no-op here: nothing in jsdom re-targets pointer events anyway.
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.setPointerCapture ??= () => {}
Element.prototype.releasePointerCapture ??= () => {}

// jsdom doesn't schedule real frames — fall back to a macrotask so `scheduleRecompute`'s
// rAF-coalesced connector redraw still resolves deterministically in tests.
globalThis.requestAnimationFrame ??= (cb: FrameRequestCallback) =>
  setTimeout(() => cb(Date.now()), 0) as unknown as number
globalThis.cancelAnimationFrame ??= (handle: number) => clearTimeout(handle)

// jsdom implements `Blob`/`File` but not their `arrayBuffer()` — it landed in the spec after the
// version jsdom targets. The real webview has it, so code that reads a pasted or dropped file (board
// card attachments) is correct and only its tests would fail. `FileReader` *is* implemented, so it
// backs the polyfill.
if (typeof Blob !== 'undefined' && typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(this)
    })
  }
}
