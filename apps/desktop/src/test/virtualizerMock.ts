/**
 * A stand-in for `@tanstack/react-virtual` in jsdom.
 *
 * jsdom reports every scroll container as 0px tall, so the real virtualizer correctly concludes
 * that nothing fits and renders no rows at all — which would make any content assertion about a
 * virtualized list fail for a reason that has nothing to do with the component under test.
 *
 * This mock renders every row by default, so a suite can keep asserting on real content. Setting
 * {@link virtualWindow} narrows it to a slice, which is how a test can check the thing that
 * actually matters about virtualization: that the component renders only the rows it was handed
 * and reserves the right height for the rest.
 *
 * Use it as an async module factory so the shared `virtualWindow` object stays the very same
 * instance the test file imports (a plain `vi.mock` factory is hoisted above imports and can't
 * close over one):
 *
 * ```ts
 * vi.mock('@tanstack/react-virtual', async () =>
 *   (await import('../../test/virtualizerMock')).virtualizerModule()
 * )
 * ```
 */
export const virtualWindow = {
  start: 0,
  end: Number.POSITIVE_INFINITY,
}

/** Restores the render-everything default. Call from `beforeEach` in any suite that narrows it. */
export function resetVirtualWindow(): void {
  virtualWindow.start = 0
  virtualWindow.end = Number.POSITIVE_INFINITY
}

interface VirtualizerOptions {
  count: number
  estimateSize: (index: number) => number
}

export function virtualizerModule() {
  return {
    useVirtualizer: (options: VirtualizerOptions) => {
      const sizes = Array.from({ length: options.count }, (_, index) => options.estimateSize(index))
      const starts: number[] = []
      let total = 0
      for (const size of sizes) {
        starts.push(total)
        total += size
      }

      return {
        getTotalSize: () => total,
        getVirtualItems: () =>
          sizes
            .map((size, index) => ({ key: index, index, start: starts[index], size }))
            .filter((item) => item.index >= virtualWindow.start && item.index <= virtualWindow.end),
        scrollToIndex: () => {},
        measureElement: () => {},
        options,
      }
    },
  }
}
