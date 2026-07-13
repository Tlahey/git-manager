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
