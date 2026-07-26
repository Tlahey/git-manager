import { describe, expect, it } from 'vitest'
import type { GitDiffFile } from '@git-manager/git-types'
import { formatUnifiedPatch } from './formatUnifiedPatch'
import { parseUnifiedDiff } from './parseUnifiedDiff'

function file(overrides: Partial<GitDiffFile> = {}): GitDiffFile {
  return {
    oldPath: 'src/a.ts',
    newPath: 'src/a.ts',
    status: 'modified',
    additions: 1,
    deletions: 1,
    isBinary: false,
    hunks: [
      {
        header: '@@ -1,3 +1,3 @@ function a()',
        lines: [
          { origin: ' ', content: 'const x = 1', oldLineno: 1, newLineno: 1 },
          { origin: '-', content: 'return x', oldLineno: 2, newLineno: null },
          { origin: '+', content: 'return x + 1', oldLineno: null, newLineno: 2 },
        ],
      },
    ],
    ...overrides,
  }
}

describe('formatUnifiedPatch', () => {
  it('renders the a/ b/ header and the hunk verbatim', () => {
    expect(formatUnifiedPatch(file())).toBe(
      [
        'diff --git a/src/a.ts b/src/a.ts',
        '--- a/src/a.ts',
        '+++ b/src/a.ts',
        '@@ -1,3 +1,3 @@ function a()',
        ' const x = 1',
        '-return x',
        '+return x + 1',
      ].join('\n')
    )
  })

  it('uses /dev/null as the old side of an added or untracked file', () => {
    expect(formatUnifiedPatch(file({ status: 'added' }))).toContain('--- /dev/null')
    expect(formatUnifiedPatch(file({ status: 'untracked' }))).toContain('--- /dev/null')
  })

  it('uses /dev/null as the new side of a deleted file', () => {
    expect(formatUnifiedPatch(file({ status: 'deleted' }))).toContain('+++ /dev/null')
  })

  it('keeps the renamed file both paths, so the rename itself is visible', () => {
    const patch = formatUnifiedPatch(file({ status: 'renamed', oldPath: 'src/old.ts' }))
    expect(patch).toContain('--- a/src/old.ts')
    expect(patch).toContain('+++ b/src/a.ts')
  })

  it('re-prefixes the "no newline at end of file" marker', () => {
    const patch = formatUnifiedPatch(
      file({
        hunks: [
          {
            header: '@@ -1 +1 @@',
            lines: [
              { origin: '+', content: 'x', oldLineno: null, newLineno: 1 },
              {
                origin: '\\',
                content: 'No newline at end of file',
                oldLineno: null,
                newLineno: null,
              },
            ],
          },
        ],
      })
    )
    expect(patch).toContain('\\ No newline at end of file')
  })

  it('emits only the header for a binary file, which has no hunks', () => {
    const patch = formatUnifiedPatch(file({ isBinary: true, hunks: [] }))
    expect(patch).toBe('diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts')
  })

  it('round-trips through parseUnifiedDiff', () => {
    const original = file()
    const [reparsed] = parseUnifiedDiff(formatUnifiedPatch(original))
    expect(reparsed.newPath).toBe(original.newPath)
    expect(reparsed.additions).toBe(original.additions)
    expect(reparsed.deletions).toBe(original.deletions)
    expect(reparsed.hunks[0].lines.map((l) => l.content)).toEqual(
      original.hunks[0].lines.map((l) => l.content)
    )
  })
})
