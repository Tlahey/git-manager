import { describe, expect, it } from 'vitest'
import type { AiContext } from '../config'
import { buildGroupingUserPrompt, parseCommitPlan } from './fileGrouping'

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
    const prompt = buildGroupingUserPrompt(context)
    expect(prompt).toContain('- src/a.ts (modified)')
    expect(prompt).toContain('- src/a.test.ts (added)')
    expect(prompt).toContain('diff body')
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
