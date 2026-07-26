import { describe, expect, it } from 'vitest'
import type { AiContext } from '../config'
import {
  assessFileGroupingCoverage,
  buildGroupingUserPrompt,
  fileGroupingFeature,
  FILE_GROUPING_INSTRUCTION,
  parseCommitPlan,
} from './fileGrouping'
import { estimateTokens } from '../promptSize'

describe('buildGroupingUserPrompt', () => {
  it('lists every changed file with its status and includes the diff', () => {
    const context: AiContext = {
      diff: 'diff body',
      repoName: 'demo',
      branch: 'main',
      files: [
        { path: 'src/a.ts', status: 'modified' },
        { path: 'src/a.test.ts', status: 'added' },
      ],
    }
    const prompt = buildGroupingUserPrompt({ context })
    expect(prompt).toContain('- src/a.ts (modified)')
    expect(prompt).toContain('- src/a.test.ts (added)')
    expect(prompt).toContain('diff body')
  })
})

describe('buildGroupingUserPrompt — sizing follows the declared window', () => {
  const bulky = (path: string, size: number) =>
    `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n+${'x'.repeat(size)}\n`

  const paths = ['src/a.ts', 'src/b.ts', 'src/c.ts']
  const diff = paths.map((p) => bulky(p, 20_000)).join('')
  const context = (overrides: Partial<AiContext> = {}): AiContext => ({
    diff,
    repoName: 'demo',
    branch: 'main',
    files: paths.map((path) => ({ path, status: 'modified' })),
    ...overrides,
  })

  it('sends more of the diff to a model with a bigger window', () => {
    const small = buildGroupingUserPrompt({ context: context(), contextTokens: 4096 })
    const large = buildGroupingUserPrompt({ context: context(), contextTokens: 32768 })
    expect(large.length).toBeGreaterThan(small.length * 3)
  })

  it.each([4096, 8192, 24576])('stays inside a %i-token window', (window) => {
    const prompt = buildGroupingUserPrompt({ context: context(), contextTokens: window })
    expect(estimateTokens(FILE_GROUPING_INSTRUCTION) + estimateTokens(prompt)).toBeLessThanOrEqual(
      window
    )
  })

  it('keeps the whole file list even on the smallest window — it is the set to partition', () => {
    // The rule this pins: the diff shrinks, the list never does. A dropped path is a file that would
    // silently never be committed, which is a broken plan rather than a vaguer one.
    const many = Array.from({ length: 40 }, (_, i) => `src/f${i}.ts`)
    const prompt = buildGroupingUserPrompt({
      context: context({
        diff: many.map((p) => bulky(p, 5000)).join(''),
        files: many.map((path) => ({ path, status: 'modified' })),
      }),
      contextTokens: 4096,
    })
    for (const path of many) expect(prompt).toContain(`- ${path} (modified)`)
  })

  it('reads the code before the noise instead of cutting at a fixed offset', () => {
    const prompt = buildGroupingUserPrompt({
      context: context({ diff: bulky('pnpm-lock.yaml', 60_000) + bulky('src/feature.ts', 4000) }),
      contextTokens: 8192,
    })
    expect(prompt).toContain(`+${'x'.repeat(4000)}`)
    expect(prompt).toContain('[... pnpm-lock.yaml: truncated')
  })

  it('names the files it could not read before the diff, not after it', () => {
    const prompt = buildGroupingUserPrompt({ context: context(), contextTokens: 4096 })
    expect(prompt.indexOf('NOT INCLUDED')).toBeLessThan(prompt.indexOf('--- DIFF ---'))
  })

  it('tells the model to still place a file it could not read', () => {
    const prompt = buildGroupingUserPrompt({ context: context(), contextTokens: 4096 })
    expect(prompt).toContain('do not reason about the contents of')
  })

  it('says nothing about omitted files when the whole diff fits', () => {
    expect(
      buildGroupingUserPrompt({ context: context({ diff: 'diff body' }), contextTokens: 32768 })
    ).not.toContain('NOT INCLUDED')
  })
})

describe('assessFileGroupingCoverage', () => {
  const bulky = (path: string, size: number) =>
    `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n+${'x'.repeat(size)}\n`

  const context = (diff: string): AiContext => ({
    diff,
    repoName: 'demo',
    branch: 'main',
    files: [{ path: 'src/a.ts', status: 'modified' }],
  })

  it('reports a small working tree as fully read', () => {
    const diff = bulky('src/a.ts', 200) + bulky('src/b.ts', 200)
    expect(assessFileGroupingCoverage({ context: context(diff), contextTokens: 24576 })).toMatchObject(
      { filesRead: 2, filesTotal: 2, complete: true }
    )
  })

  it('counts what a tight window had to leave out', () => {
    const diff = Array.from({ length: 10 }, (_, i) => bulky(`src/f${i}.ts`, 5000)).join('')
    const coverage = assessFileGroupingCoverage({ context: context(diff), contextTokens: 4096 })
    expect(coverage.filesTotal).toBe(10)
    expect(coverage.filesRead).toBeLessThan(10)
    expect(coverage.complete).toBe(false)
  })

  it('names a window that would actually carry the whole tree', () => {
    const diff = Array.from({ length: 10 }, (_, i) => bulky(`src/f${i}.ts`, 5000)).join('')
    const { requiredContextTokens } = assessFileGroupingCoverage({
      context: context(diff),
      contextTokens: 4096,
    })
    expect(
      assessFileGroupingCoverage({ context: context(diff), contextTokens: requiredContextTokens })
        .complete
    ).toBe(true)
  })
})

describe('fileGroupingFeature', () => {
  it('declares the file list, not the diff, as the set to partition', () => {
    expect(fileGroupingFeature.instruction).toContain('is COMPLETE and is the authority')
  })

  it('requires every unread file to still land in a commit', () => {
    // The failure this guards: shown nine files of forty, a model plans nine and drops the rest —
    // a plan that would leave most of the user's work unstaged.
    expect(fileGroupingFeature.instruction).toContain(
      'including every file whose diff you were not shown'
    )
    expect(fileGroupingFeature.instruction).toContain('is placed from its path')
  })

  it('keeps truncation out of the messages, which get committed', () => {
    expect(fileGroupingFeature.instruction).toContain('Never mention truncation')
  })
})

describe('parseCommitPlan', () => {
  it('parses the schema shape { commits: [...] }', () => {
    expect(
      parseCommitPlan('{"commits":[{"commitMessage":"feat: a","files":["src/a.ts"]}]}')
    ).toEqual([{ commitMessage: 'feat: a', files: ['src/a.ts'] }])
  })

  it('parses a bare JSON array too', () => {
    expect(parseCommitPlan('[{"commitMessage":"fix: b","files":["b.ts"]}]')).toEqual([
      { commitMessage: 'fix: b', files: ['b.ts'] },
    ])
  })

  it('accepts a legacy "message" key', () => {
    expect(parseCommitPlan('[{"message":"chore: c","files":["c.ts"]}]')).toEqual([
      { commitMessage: 'chore: c', files: ['c.ts'] },
    ])
  })

  it('extracts JSON wrapped in prose and markdown fences', () => {
    const raw = 'Here you go:\n```json\n{"commits":[{"commitMessage":"fix: b","files":["b.ts"]}]}\n```\n'
    expect(parseCommitPlan(raw)).toEqual([{ commitMessage: 'fix: b', files: ['b.ts'] }])
  })

  it('drops malformed entries and non-string file paths', () => {
    const raw =
      '{"commits":[{"commitMessage":"feat: a","files":["a.ts", 3]}, {"files":["b.ts"]}, {"commitMessage":"x","files":[]}]}'
    expect(parseCommitPlan(raw)).toEqual([{ commitMessage: 'feat: a', files: ['a.ts'] }])
  })

  it('throws when no JSON is present', () => {
    expect(() => parseCommitPlan('no json here')).toThrow()
  })

  it('throws when there are no usable commits', () => {
    expect(() => parseCommitPlan('{"commits":[{"commitMessage":"","files":[]}]}')).toThrow()
  })
})
