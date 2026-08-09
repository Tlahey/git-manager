import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => cleanup())

// jsdom doesn't implement ResizeObserver — cmdk (Command) observes elements to manage its
// selected-item scroll-into-view behavior. Tests don't need real resize behavior, just a stub
// that doesn't throw (same stub as apps/desktop/vitest.setup.ts).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub

// jsdom doesn't implement scrollIntoView either — cmdk calls it on the selected item to keep it in
// view as the user arrows through the list.
Element.prototype.scrollIntoView ??= () => {}

// jsdom implements no pointer capture — Radix's Select trigger calls `hasPointerCapture` on every
// pointerdown and throws without it, which is what used to make its open menu untestable here (same
// stubs as apps/desktop/vitest.setup.ts). Capture is a no-op: jsdom re-targets no pointer events.
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.setPointerCapture ??= () => {}
Element.prototype.releasePointerCapture ??= () => {}
