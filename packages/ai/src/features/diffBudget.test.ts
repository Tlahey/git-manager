import { describe, expect, it } from 'vitest'
import { budgetDiff, classifyDiffPath, splitDiffByFile } from './diffBudget'

/** One file's section of a plain `git diff` patch, `size` chars of body. */
function section(path: string, size: number): string {
  return `diff --git a/${path} b/${path}\nindex 1111111..2222222 100644\n--- a/${path}\n+++ b/${path}\n@@ -1,1 +1,1 @@\n+${'x'.repeat(size)}\n`
}

/** The same, as the Rust backend renders it: every line prefixed by origin, so the file header
 * arrives with a leading space. */
function rustSection(path: string, size: number): string {
  return ` diff --git a/${path} b/${path}\nindex 1111111..2222222 100644\n--- a/${path}\n+++ b/${path}\n @@ -1,1 +1,1 @@\n+${'x'.repeat(size)}\n`
}

describe('classifyDiffPath', () => {
  it('reads ordinary code as source', () => {
    expect(classifyDiffPath('apps/desktop/src/hooks/useCodeReview.ts')).toBe('source')
    expect(classifyDiffPath('src-tauri/src/commands/ai.rs')).toBe('source')
  })

  it('recognizes tests by suffix and by directory', () => {
    expect(classifyDiffPath('src/hooks/useCodeReview.test.ts')).toBe('test')
    expect(classifyDiffPath('src/components/Panel.spec.tsx')).toBe('test')
    expect(classifyDiffPath('src/__tests__/helper.ts')).toBe('test')
  })

  it('reads prose and config as documentation', () => {
    expect(classifyDiffPath('docs/ai/code-review.md')).toBe('doc')
    expect(classifyDiffPath('packages/i18n/locales/fr/git.json')).toBe('doc')
    expect(classifyDiffPath('.github/workflows/ci.yml')).toBe('doc')
  })

  it('recognizes machine-written files, whatever their extension suggests', () => {
    expect(classifyDiffPath('pnpm-lock.yaml')).toBe('generated')
    expect(classifyDiffPath('apps/desktop/src-tauri/Cargo.lock')).toBe('generated')
    // A snapshot looks like a test and a lockfile looks like config — generated wins both.
    expect(classifyDiffPath('src/__tests__/__snapshots__/a.test.ts.snap')).toBe('generated')
    expect(classifyDiffPath('dist/bundle.js')).toBe('generated')
  })

  it('lets a caller correct it for a path it gets wrong', () => {
    // Both directions the heuristic cannot see from a name: a checked-in schema is the change, and
    // a deliberately reviewed lockfile bump is not noise this time.
    expect(classifyDiffPath('schema/user.json', { 'schema/user.json': 'source' })).toBe('source')
    expect(classifyDiffPath('pnpm-lock.yaml', { 'pnpm-lock.yaml': 'source' })).toBe('source')
    // And downwards, for a generated file the heuristic reads as ordinary code.
    expect(classifyDiffPath('src/api.gen.ts', { 'src/api.gen.ts': 'generated' })).toBe('generated')
  })

  it('leaves every path the override does not name alone', () => {
    const overrides = { 'pnpm-lock.yaml': 'source' } as const
    expect(classifyDiffPath('src/a.ts', overrides)).toBe('source')
    expect(classifyDiffPath('Cargo.lock', overrides)).toBe('generated')
    expect(classifyDiffPath('docs/a.md', overrides)).toBe('doc')
  })
})

describe('splitDiffByFile', () => {
  it('splits a plain git patch into one section per file', () => {
    const diff = section('a.ts', 10) + section('b.ts', 10)
    const parts = splitDiffByFile(diff)
    expect(parts.map((p) => p.path)).toEqual(['a.ts', 'b.ts'])
  })

  it("handles the backend's origin-prefixed headers", () => {
    // The regression that would make this whole module a no-op: git2's Patch callback prefixes the
    // file header with a space, so a parser anchored on a bare `diff --git` splits nothing.
    const diff = rustSection('a.ts', 10) + rustSection('b.ts', 10)
    expect(splitDiffByFile(diff).map((p) => p.path)).toEqual(['a.ts', 'b.ts'])
  })

  it('loses nothing: the sections rejoin into the original text', () => {
    const diff = section('a.ts', 10) + section('b.ts', 10)
    expect(
      splitDiffByFile(diff)
        .map((p) => p.text)
        .join('')
    ).toBe(diff)
  })

  it('names a deleted file by its old path rather than /dev/null', () => {
    const diff = `diff --git a/gone.ts b/dev/null\ndeleted file mode 100644\n-old\n`
    expect(splitDiffByFile(diff)[0].path).toBe('gone.ts')
  })

  it('returns nothing for text carrying no file header', () => {
    expect(splitDiffByFile('just some text')).toEqual([])
    expect(splitDiffByFile('')).toEqual([])
  })
})

describe('budgetDiff — when everything fits', () => {
  it('returns the diff untouched', () => {
    const diff = section('a.ts', 10) + section('b.ts', 10)
    const result = budgetDiff(diff, 10_000)
    expect(result.text).toBe(diff)
    expect(result.omitted).toEqual([])
    expect(result.truncated).toEqual([])
  })
})

describe('budgetDiff — priority', () => {
  it('serves source before tests, and tests before docs, when the budget forces a choice', () => {
    // Too tight for a useful share each, so only the highest-priority file survives the cut.
    const diff =
      section('README.md', 3000) + section('a.test.ts', 3000) + section('src/a.ts', 3000)
    const result = budgetDiff(diff, 1000)

    expect(result.text).toContain('src/a.ts')
    expect(result.omitted).toEqual(['README.md', 'a.test.ts'])
  })

  it('reads source whole even when a lockfile dwarfs it, and cuts the lockfile instead', () => {
    // The blind head-cut's worst case: the lockfile sorts first alphabetically and is enormous, so
    // a `head -c` would have shown nothing else. Priority is about who is served first and who
    // survives the cut — leftover budget still flows down to the lockfile rather than being wasted.
    const diff = section('pnpm-lock.yaml', 50_000) + section('src/a.ts', 500)
    const result = budgetDiff(diff, 4000)

    expect(result.text).toContain('x'.repeat(500))
    expect(result.truncated).toEqual(['pnpm-lock.yaml'])
  })

  it('omits the lockfile outright once real files need the whole budget', () => {
    const diff =
      section('pnpm-lock.yaml', 50_000) + section('src/a.ts', 3000) + section('src/b.ts', 3000)
    const result = budgetDiff(diff, 4000)

    expect(result.omitted).toEqual(['pnpm-lock.yaml'])
    expect(result.text).toContain('src/a.ts')
    expect(result.text).toContain('src/b.ts')
  })

  it('always shows something, even when every share is under the minimum', () => {
    // 40 files on an 8000-char budget: shares start at 200. Returning an empty diff here would be
    // worse than the blind cut, so the top-priority file takes what there is.
    const many = Array.from({ length: 40 }, (_, i) => section(`src/f${i}.ts`, 4000)).join('')
    const result = budgetDiff(many, 800)

    expect(result.text.length).toBeGreaterThan(0)
    // None of them fits whole, so the budget goes to one file as fully as it can rather than
    // buying two half-views that each invite a wrong finding.
    expect(result.omitted).toHaveLength(39)
  })

  it('shows whole files rather than a window into every file', () => {
    const diff =
      section('src/a.ts', 2000) + section('src/b.ts', 2000) + section('src/c.ts', 2000)
    const result = budgetDiff(diff, 4500)

    // A head-cut would have shown a.ts, part of b.ts and nothing of c.ts — silently. Here two files
    // are readable end to end and the third is named as unread, which is what the reviewer needs to
    // know. Splitting 4500 three ways would instead give three partial views and no complete one.
    expect(result.truncated).toEqual([])
    expect(result.text).toContain('src/a.ts')
    expect(result.text).toContain('src/b.ts')
    expect(result.omitted).toEqual(['src/c.ts'])
  })
})

describe('budgetDiff — allocation', () => {
  it('rolls a small file surplus forward so a larger one can still be shown whole', () => {
    // Smallest-first: the cheap file is served whole and leaves the rest of the pool for the big
    // one, which also fits whole. The budget is deliberately below the total so the allocator
    // actually runs — above it, budgetDiff short-circuits and the test would prove nothing.
    const diff = section('src/small.ts', 50) + section('src/big.ts', 1500) + section('docs/x.md', 9000)
    const result = budgetDiff(diff, 4000)

    // Both source files whole; the surplus then flows down to the doc, which is cut.
    expect(result.text).toContain('x'.repeat(1500))
    expect(result.text).toContain('x'.repeat(50))
    expect(result.truncated).toEqual(['docs/x.md'])
  })

  it('omits — and names — the files it could not afford at all', () => {
    const diff =
      section('src/a.ts', 4000) + section('src/b.ts', 4000) + section('src/c.ts', 4000)
    const result = budgetDiff(diff, 900)

    // 900 over three files is 300 each, below the useful minimum: one file gets the lot instead.
    expect(result.omitted.length).toBeGreaterThan(0)
    expect(result.omitted.every((p) => ['src/a.ts', 'src/b.ts', 'src/c.ts'].includes(p))).toBe(true)
  })

  it('marks a cut file inline, naming it and what fraction was shown', () => {
    const diff = section('src/a.ts', 5000)
    const result = budgetDiff(diff, 1000)

    expect(result.truncated).toEqual(['src/a.ts'])
    expect(result.text).toMatch(/\[\.\.\. src\/a\.ts: truncated, \d+ of \d+ chars shown\]/)
  })

  it('keeps the diff in its original file order, not the allocation order', () => {
    // Allocation visits smallest-first; the output must not be reordered by size.
    const diff = section('src/z-big.ts', 900) + section('src/a-small.ts', 50)
    const result = budgetDiff(diff, 5000)
    expect(result.text.indexOf('z-big')).toBeLessThan(result.text.indexOf('a-small'))
  })

  it('respects the budget', () => {
    const diff =
      section('src/a.ts', 9000) + section('src/b.ts', 9000) + section('docs/c.md', 9000)
    const result = budgetDiff(diff, 3000)
    expect(result.text.length).toBeLessThanOrEqual(3000 + 200) // + the inline truncation markers
  })
})

describe('budgetDiff — fallback', () => {
  it('falls back to a plain head-cut when the text has no file structure', () => {
    const result = budgetDiff('x'.repeat(5000), 1000)
    expect(result.text).toContain('[diff truncated, showing first 1000 chars]')
    expect(result.omitted).toEqual([])
  })

  it('leaves an empty diff alone', () => {
    expect(budgetDiff('', 1000)).toEqual({ text: '', omitted: [], truncated: [] })
  })
})

describe('budgetDiff — tier overrides', () => {
  // The scenario limitation #3 named: a lockfile bump the user is deliberately reviewing, sitting
  // behind a big source file on a budget that cannot serve both whole.
  const diff = section('src/a.ts', 4000) + section('pnpm-lock.yaml', 500)

  it('omits the lockfile under the heuristic, however deliberate the bump was', () => {
    // The source file takes the budget, and what is left is too little to be worth spending — so
    // the one file the user actually wanted read is the one named as unread.
    expect(budgetDiff(diff, 4300).omitted).toEqual(['pnpm-lock.yaml'])
  })

  it('reads a promoted lockfile, cutting the source file instead', () => {
    const promoted = budgetDiff(diff, 4300, { 'pnpm-lock.yaml': 'source' })
    expect(promoted.omitted).toEqual([])
    // Promoted into the same tier, smallest-first serves it whole and the large file absorbs the
    // shortfall — which is exactly the trade the caller asked for.
    expect(promoted.text).toContain('pnpm-lock.yaml')
    expect(promoted.truncated).toEqual(['src/a.ts'])
  })

  it('can also push a file down, for generated code that reads as source', () => {
    const generated = section('src/api.gen.ts', 3000) + section('src/real.ts', 3000)
    const result = budgetDiff(generated, 3400, { 'src/api.gen.ts': 'generated' })
    expect(result.omitted).toEqual(['src/api.gen.ts'])
  })

  it('changes only priority, never what a retained file contains', () => {
    // The override reorders reading; it must not rewrite or re-cut the diff text itself.
    const whole = budgetDiff(diff, 100_000)
    const overridden = budgetDiff(diff, 100_000, { 'pnpm-lock.yaml': 'source' })
    expect(overridden).toEqual(whole)
  })
})
