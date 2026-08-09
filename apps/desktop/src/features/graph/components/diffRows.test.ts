import { describe, it, expect } from 'vitest'
import type { GitDiffFile } from '@git-manager/git-types'
import { DIFF_ROW_HEIGHTS, buildDiffRows, diffFileDisplayPath } from './diffRows'

function file(overrides: Partial<GitDiffFile> = {}): GitDiffFile {
  return {
    oldPath: 'src/a.ts',
    newPath: 'src/a.ts',
    status: 'modified',
    isBinary: false,
    additions: 2,
    deletions: 1,
    hunks: [
      {
        header: '@@ -1,3 +1,4 @@',
        lines: [
          { origin: ' ', oldLineno: 1, newLineno: 1, content: 'unchanged' },
          { origin: '-', oldLineno: 2, newLineno: null, content: 'removed line' },
          { origin: '+', oldLineno: null, newLineno: 2, content: 'added line' },
        ],
      },
    ],
    ...overrides,
  }
}

describe('diffFileDisplayPath', () => {
  it('shows "old → new" for a rename and the new path otherwise', () => {
    expect(
      diffFileDisplayPath(file({ status: 'renamed', oldPath: 'old.ts', newPath: 'new.ts' }))
    ).toBe('old.ts → new.ts')
    expect(diffFileDisplayPath(file({ status: 'modified' }))).toBe('src/a.ts')
  })
})

describe('buildDiffRows', () => {
  it('emits a header then one row per hunk header and per line', () => {
    const rows = buildDiffRows([file()])
    expect(rows.map((row) => row.kind)).toEqual(['file', 'hunk', 'line', 'line', 'line'])
  })

  it('separates consecutive files with a gap row, and never leads with one', () => {
    const rows = buildDiffRows([file({ newPath: 'a.ts' }), file({ newPath: 'b.ts' })])
    expect(rows[0].kind).toBe('file')
    expect(rows.filter((row) => row.kind === 'gap')).toHaveLength(1)
  })

  it("replaces a binary file's body with a single placeholder row", () => {
    const rows = buildDiffRows([file({ isBinary: true, hunks: [] })])
    expect(rows.map((row) => row.kind)).toEqual(['file', 'binary'])
  })

  it('gives every row a unique key, even when the same path appears twice', () => {
    const rows = buildDiffRows([file(), file()])
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length)
  })

  describe('box edges', () => {
    it('closes the box on the last body row of each file', () => {
      const rows = buildDiffRows([file(), file({ newPath: 'b.ts' })])
      const closing = rows.filter((row) => 'isLastOfFile' in row && row.isLastOfFile)
      expect(closing).toHaveLength(2)
      expect(closing.every((row) => row.kind === 'line')).toBe(true)
    })

    it('lets the header close its own box when the file has no body row', () => {
      // A pure mode change: no hunks, not binary — the header IS the whole box.
      const rows = buildDiffRows([file({ hunks: [] })])
      expect(rows).toHaveLength(1)
      expect(rows[0].kind === 'file' && rows[0].isLastOfFile).toBe(true)
    })

    it("closes a binary file's box on its placeholder, not its header", () => {
      const rows = buildDiffRows([file({ isBinary: true, hunks: [] })])
      expect(rows[0].kind === 'file' && rows[0].isLastOfFile).toBe(false)
      expect(rows[1].kind === 'binary' && rows[1].isLastOfFile).toBe(true)
    })
  })

  describe('heights', () => {
    it('gives each row the height its kind declares', () => {
      const rows = buildDiffRows([file(), file({ newPath: 'b.ts', isBinary: true, hunks: [] })])
      for (const row of rows) {
        expect(row.height).toBe(DIFF_ROW_HEIGHTS[row.kind])
      }
    })

    it('totals to a height that grows linearly with the number of lines', () => {
      // The property the virtualizer relies on: total height is a pure function of the row list,
      // so it can place any row without measuring the DOM.
      const total = (rows: { height: number }[]) => rows.reduce((sum, row) => sum + row.height, 0)

      const oneLine = buildDiffRows([
        file({
          hunks: [
            { header: '@@', lines: [{ origin: '+', oldLineno: null, newLineno: 1, content: 'a' }] },
          ],
        }),
      ])
      const twoLines = buildDiffRows([
        file({
          hunks: [
            {
              header: '@@',
              lines: [
                { origin: '+', oldLineno: null, newLineno: 1, content: 'a' },
                { origin: '+', oldLineno: null, newLineno: 2, content: 'b' },
              ],
            },
          ],
        }),
      ])

      expect(total(twoLines) - total(oneLine)).toBe(DIFF_ROW_HEIGHTS.line)
    })
  })

  it('handles an empty diff', () => {
    expect(buildDiffRows([])).toEqual([])
  })

  it('scales to a diff far larger than any viewport without special-casing', () => {
    const huge = file({
      hunks: [
        {
          header: '@@ big @@',
          lines: Array.from({ length: 50_000 }, (_, i) => ({
            origin: '+' as const,
            oldLineno: null,
            newLineno: i + 1,
            content: `line ${i}`,
          })),
        },
      ],
    })
    const rows = buildDiffRows([huge])
    expect(rows).toHaveLength(50_002)
    expect(rows[rows.length - 1]).toMatchObject({ kind: 'line', isLastOfFile: true })
  })
})
