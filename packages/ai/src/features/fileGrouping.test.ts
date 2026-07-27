import { describe, expect, it } from 'vitest'
import { groupingOutputTokens, parseCommitPlan } from './fileGrouping'
import { estimateTokens, RESERVED_OUTPUT_TOKENS } from '../promptSize'


describe('groupingOutputTokens', () => {
  const deep = (n: number) =>
    Array.from(
      { length: n },
      (_, i) => `apps/desktop/src/components/git-graph/components/Panel${i}.tsx`
    )
  const flat = (n: number) => Array.from({ length: n }, (_, i) => `f${i}.ts`)

  it('grows with the changeset, because the plan must name every file', () => {
    // A flat cap truncates a large plan mid-array — and since the output is parsed, that is a hard
    // failure ("not valid JSON"), not a shorter answer.
    expect(groupingOutputTokens(deep(40))).toBeGreaterThan(groupingOutputTokens(deep(10)))
  })

  it('never drops below the ordinary prose reserve on a small changeset', () => {
    // Two files still need room for their commit messages and the JSON around them.
    expect(groupingOutputTokens(flat(1))).toBe(RESERVED_OUTPUT_TOKENS)
    expect(groupingOutputTokens([])).toBe(RESERVED_OUTPUT_TOKENS)
  })

  /**
   * The reason it measures paths instead of counting files. The flat 24-tokens-per-file it replaced
   * was roughly what one deep path costs on its own, leaving nothing for the commit messages or the
   * JSON around them — so a nested repo truncated its plan while a flat one over-reserved.
   */
  it('reserves more for deep paths than for flat ones at the same file count', () => {
    expect(groupingOutputTokens(deep(60))).toBeGreaterThan(groupingOutputTokens(flat(60)))
  })

  it('covers the paths themselves plus a message per commit', () => {
    const paths = deep(60)
    // Everything the answer must restate verbatim, before any commit scaffolding.
    const pathCost = estimateTokens(paths.map((p) => `"${p}",`).join(''))
    expect(groupingOutputTokens(paths)).toBeGreaterThan(pathCost)
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
