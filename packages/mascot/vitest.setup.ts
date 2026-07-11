import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => cleanup())

// jsdom bug: `ShadowRoot.querySelector('.some-class')` fails to match SVG elements even though
// `element.matches('.some-class')` correctly returns true for the same element and same
// selector — verified by direct experiment (plain document.querySelector works fine; only the
// shadow-root-scoped lookup misbehaves). GitMascotElement queries its rendered SVG root by class
// from inside a shadow root (`root.querySelector('.gm-svg')`), so without this shim its `svg`
// reference stays null under jsdom and `sync()` silently no-ops on every test. Falls back to a
// manual tree walk + `.matches()` (proven correct) only when the native call finds nothing.
const originalQuerySelector = ShadowRoot.prototype.querySelector
ShadowRoot.prototype.querySelector = function (this: ShadowRoot, selector: string) {
  const native = originalQuerySelector.call(this, selector)
  if (native) return native
  const walker = document.createTreeWalker(this, NodeFilter.SHOW_ELEMENT)
  let node = walker.nextNode() as Element | null
  while (node) {
    if (node.matches(selector)) return node
    node = walker.nextNode() as Element | null
  }
  return null
}
