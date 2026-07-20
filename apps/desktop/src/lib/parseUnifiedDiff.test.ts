import { describe, it, expect } from 'vitest'
import { parseUnifiedDiff, reconstructDiffSides } from './parseUnifiedDiff'

describe('parseUnifiedDiff', () => {
  it('parses a modified file with line numbers and counts', () => {
    const diff = [
      'diff --git a/src/x.ts b/src/x.ts',
      'index 111..222 100644',
      '--- a/src/x.ts',
      '+++ b/src/x.ts',
      '@@ -1,3 +1,3 @@',
      ' const a = 1',
      '-const b = 2',
      '+const b = 3',
      ' const c = 4',
      '',
    ].join('\n')
    const [file] = parseUnifiedDiff(diff)
    expect(file.newPath).toBe('src/x.ts')
    expect(file.status).toBe('modified')
    expect(file.additions).toBe(1)
    expect(file.deletions).toBe(1)
    expect(file.hunks).toHaveLength(1)
    const removed = file.hunks[0].lines.find((l) => l.origin === '-')!
    const added = file.hunks[0].lines.find((l) => l.origin === '+')!
    expect(removed).toMatchObject({ oldLineno: 2, newLineno: null })
    expect(added).toMatchObject({ oldLineno: null, newLineno: 2 })
  })

  it('classifies added, deleted and multi-file diffs', () => {
    const diff = [
      'diff --git a/new.ts b/new.ts',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/new.ts',
      '@@ -0,0 +1,1 @@',
      '+hello',
      'diff --git a/gone.ts b/gone.ts',
      'deleted file mode 100644',
      '--- a/gone.ts',
      '+++ /dev/null',
      '@@ -1,1 +0,0 @@',
      '-bye',
    ].join('\n')
    const files = parseUnifiedDiff(diff)
    expect(files).toHaveLength(2)
    expect(files[0]).toMatchObject({ newPath: 'new.ts', status: 'added', additions: 1 })
    expect(files[1]).toMatchObject({ oldPath: 'gone.ts', status: 'deleted', deletions: 1 })
  })

  it('flags binary files', () => {
    const diff = [
      'diff --git a/img.png b/img.png',
      'index 111..222 100644',
      'Binary files a/img.png and b/img.png differ',
    ].join('\n')
    const [file] = parseUnifiedDiff(diff)
    expect(file.isBinary).toBe(true)
  })

  it('returns an empty array for empty input', () => {
    expect(parseUnifiedDiff('')).toEqual([])
  })
})

describe('reconstructDiffSides', () => {
  it('rebuilds original and modified text from hunks', () => {
    const diff = [
      'diff --git a/x.ts b/x.ts',
      '--- a/x.ts',
      '+++ b/x.ts',
      '@@ -1,3 +1,3 @@',
      ' keep',
      '-before',
      '+after',
      ' tail',
    ].join('\n')
    const [file] = parseUnifiedDiff(diff)
    const { original, modified } = reconstructDiffSides(file)
    expect(original).toBe('keep\nbefore\ntail')
    expect(modified).toBe('keep\nafter\ntail')
  })
})
