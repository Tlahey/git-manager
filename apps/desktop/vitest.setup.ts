import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Testing-library's automatic between-test cleanup only kicks in when vitest runs with
// `globals: true` (it looks for a global `afterEach`), which this config doesn't use — without
// this explicit hook, every `render()` accumulates into the same jsdom document across tests,
// so `screen` queries start matching stale duplicates from earlier tests in the file.
afterEach(() => cleanup())

// jsdom doesn't implement ResizeObserver — ThreeWayMergeEditor observes its outer container to
// recompute connector geometry on resize. Tests don't need real resize behavior, just a stub
// that doesn't throw.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub

// jsdom doesn't schedule real frames — fall back to a macrotask so `scheduleRecompute`'s
// rAF-coalesced connector redraw still resolves deterministically in tests.
globalThis.requestAnimationFrame ??= (cb: FrameRequestCallback) =>
  setTimeout(() => cb(Date.now()), 0) as unknown as number
globalThis.cancelAnimationFrame ??= (handle: number) => clearTimeout(handle)
