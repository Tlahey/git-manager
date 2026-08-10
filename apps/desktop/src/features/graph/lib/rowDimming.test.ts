import { describe, it, expect } from 'vitest'
import { isRowDimmed } from './rowDimming'

const none = { matchSet: null, authorMatchSet: null, dragHighlightSet: null }
const set = (...oids: string[]) => new Set(oids)

describe('isRowDimmed', () => {
  it('dims nothing when no filter is active', () => {
    expect(isRowDimmed('a', none)).toBe(false)
  })

  it('dims what a single active filter leaves out, and only that', () => {
    const searching = { ...none, matchSet: set('b') }
    expect(isRowDimmed('a', searching)).toBe(true)
    expect(isRowDimmed('b', searching)).toBe(false)
  })

  /**
   * The rule that is easy to get backwards: two active filters combine with OR. AND would show only
   * the selected author's matching commits — an intersection nobody asked for.
   */
  it('keeps a row lit when it matches either active filter', () => {
    const both = { ...none, matchSet: set('a'), authorMatchSet: set('b') }
    expect(isRowDimmed('a', both)).toBe(false)
    expect(isRowDimmed('b', both)).toBe(false)
    expect(isRowDimmed('c', both)).toBe(true)
  })

  /** A filter that matched nothing is still active, and dims everything it does not contain. */
  it('treats an empty match set as active, not as absent', () => {
    expect(isRowDimmed('a', { ...none, matchSet: set() })).toBe(true)
  })

  /** While a ref is dragged, the only question is where it can land. */
  it('lets a drag override both filters', () => {
    const dragging = { matchSet: set('a'), authorMatchSet: set('a'), dragHighlightSet: set('b') }
    expect(isRowDimmed('a', dragging)).toBe(true)
    expect(isRowDimmed('b', dragging)).toBe(false)
  })
})
