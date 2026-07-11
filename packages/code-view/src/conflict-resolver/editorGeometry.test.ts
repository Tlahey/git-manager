import { describe, expect, it } from 'vitest'
import type { editor } from 'monaco-editor'
import { getTopForLineNumberSafe } from './editorGeometry'

// The function never touches the editor instance today (it recomputes from line height and
// hidden/zone metadata alone) — the parameter exists for signature stability.
const dummyEditor = {} as editor.IStandaloneCodeEditor
const LINE_HEIGHT = 19

describe('getTopForLineNumberSafe', () => {
  it('is 0 for the first line (and anything before it)', () => {
    expect(getTopForLineNumberSafe(dummyEditor, 1, LINE_HEIGHT, [], [])).toBe(0)
    expect(getTopForLineNumberSafe(dummyEditor, 0, LINE_HEIGHT, [], [])).toBe(0)
  })

  it('stacks plain lines at lineHeight each', () => {
    expect(getTopForLineNumberSafe(dummyEditor, 5, LINE_HEIGHT, [], [])).toBe(4 * LINE_HEIGHT)
  })

  it('skips lines inside hidden ranges', () => {
    // Lines 4-7 hidden: line 10's top counts lines 1,2,3,8,9 → 5 lines.
    expect(getTopForLineNumberSafe(dummyEditor, 10, LINE_HEIGHT, [{ start: 4, end: 7 }], [])).toBe(5 * LINE_HEIGHT)
  })

  it('adds view-zone heights anchored below preceding lines', () => {
    const zones = [{ afterLineNumber: 2, heightInLines: 1.5 }]
    expect(getTopForLineNumberSafe(dummyEditor, 4, LINE_HEIGHT, [], zones)).toBe(3 * LINE_HEIGHT + 1.5 * LINE_HEIGHT)
  })

  it('resolves a line inside a hidden range to the bottom of the last visible line above it', () => {
    const hidden = [{ start: 4, end: 7 }]
    const insideTop = getTopForLineNumberSafe(dummyEditor, 5, LINE_HEIGHT, hidden, [])
    const lastVisibleTop = getTopForLineNumberSafe(dummyEditor, 3, LINE_HEIGHT, hidden, [])
    expect(insideTop).toBe(lastVisibleTop + LINE_HEIGHT)
  })

  it('combines hidden ranges and view zones (the collapsed-banner case)', () => {
    // Collapsed block: lines 4-7 hidden, 1.5-line banner zone after line 3.
    const hidden = [{ start: 4, end: 7 }]
    const zones = [{ afterLineNumber: 3, heightInLines: 1.5 }]
    // Line 8's top: lines 1-3 visible (3 * lh) + banner (1.5 * lh).
    expect(getTopForLineNumberSafe(dummyEditor, 8, LINE_HEIGHT, hidden, zones)).toBe(4.5 * LINE_HEIGHT)
  })
})
