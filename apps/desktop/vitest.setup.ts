import '@testing-library/jest-dom/vitest'

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
globalThis.requestAnimationFrame ??= (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number
globalThis.cancelAnimationFrame ??= (handle: number) => clearTimeout(handle)
