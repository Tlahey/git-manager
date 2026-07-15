import { describe, it, expect } from 'vitest'
import { parseUnifiedDiff } from './parseUnifiedDiff'

describe('parseUnifiedDiff', () => {
  it('returns no hunks for an empty patch', () => {
    expect(parseUnifiedDiff('')).toEqual([])
  })

  it('parses hunks with resolved old/new line numbers', () => {
    const patch = ['@@ -1,3 +1,4 @@', ' a', '-b', '+B', '+B2', ' c'].join('\n')
    const [hunk] = parseUnifiedDiff(patch)
    expect(hunk.header).toBe('@@ -1,3 +1,4 @@')
    expect(hunk.lines).toEqual([
      { type: 'context', text: 'a', oldNo: 1, newNo: 1 },
      { type: 'del', text: 'b', oldNo: 2, newNo: null },
      { type: 'add', text: 'B', oldNo: null, newNo: 2 },
      { type: 'add', text: 'B2', oldNo: null, newNo: 3 },
      { type: 'context', text: 'c', oldNo: 3, newNo: 4 },
    ])
  })

  it('handles multiple hunks and resets numbering per hunk header', () => {
    const patch = ['@@ -1,1 +1,1 @@', '-a', '+A', '@@ -10,1 +10,1 @@', '-x', '+X'].join('\n')
    const hunks = parseUnifiedDiff(patch)
    expect(hunks).toHaveLength(2)
    expect(hunks[1].lines[0]).toMatchObject({ type: 'del', text: 'x', oldNo: 10 })
    expect(hunks[1].lines[1]).toMatchObject({ type: 'add', text: 'X', newNo: 10 })
  })

  it('ignores the "no newline" marker and a trailing blank line', () => {
    const patch = ['@@ -1,1 +1,1 @@', '-a', '\\ No newline at end of file', '+b', ''].join('\n')
    const [hunk] = parseUnifiedDiff(patch)
    expect(hunk.lines.map((l) => l.text)).toEqual(['a', 'b'])
  })
})
