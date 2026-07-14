import { describe, expect, it } from 'vitest'
import type { AiContext } from '../config'
import { buildCommitUserPrompt, detectScope, truncateDiff } from './commitMessage'

describe('detectScope', () => {
  it('returns the shared top-level directory when all files share one', () => {
    expect(
      detectScope([
        { path: 'src/a.ts', status: 'modified' },
        { path: 'src/b.ts', status: 'added' },
      ])
    ).toBe('src')
  })

  it('returns undefined when files span multiple top-level directories', () => {
    expect(
      detectScope([
        { path: 'src/a.ts', status: 'modified' },
        { path: 'docs/b.md', status: 'added' },
      ])
    ).toBeUndefined()
  })

  it('returns undefined for no files', () => {
    expect(detectScope([])).toBeUndefined()
  })
})

describe('truncateDiff', () => {
  it('returns short diffs unchanged', () => {
    expect(truncateDiff('abc')).toBe('abc')
  })

  it('truncates and marks oversized diffs', () => {
    const out = truncateDiff('x'.repeat(50), 10)
    expect(out.startsWith('x'.repeat(10))).toBe(true)
    expect(out).toContain('[diff truncated, showing first 10 chars]')
  })
})

describe('buildCommitUserPrompt', () => {
  const base: AiContext = {
    diff: 'diff body',
    repoName: 'demo',
    branch: 'main',
    files: [{ path: 'src/a.ts', status: 'modified' }],
  }

  it('includes repo/branch context and a scope hint when cohesive', () => {
    const prompt = buildCommitUserPrompt(base)
    expect(prompt).toContain('Repository: demo (branch: main)')
    expect(prompt).toContain('Suggested scope: src')
    expect(prompt).toContain('diff body')
  })

  it('omits the scope hint when files span directories', () => {
    const prompt = buildCommitUserPrompt({
      ...base,
      files: [
        { path: 'src/a.ts', status: 'modified' },
        { path: 'docs/b.md', status: 'added' },
      ],
    })
    expect(prompt).not.toContain('Suggested scope:')
  })

  it("injects the project's commit convention when present", () => {
    const prompt = buildCommitUserPrompt({
      ...base,
      commitConvention: { source: 'commitlint.config.js', content: 'type-enum: [feat, fix]' },
    })
    expect(prompt).toContain('commitlint.config.js')
    expect(prompt).toContain('type-enum: [feat, fix]')
  })

  it("injects the project's recent commit subjects as the style to imitate", () => {
    const prompt = buildCommitUserPrompt({
      ...base,
      recentCommits: ['Add login page', 'Fix startup crash'],
    })
    expect(prompt).toContain('- Add login page')
    expect(prompt).toContain('- Fix startup crash')
  })

  it('adds no style section when the repo has neither convention nor history', () => {
    const prompt = buildCommitUserPrompt(base)
    expect(prompt).not.toContain('OVERRIDES')
    expect(prompt).not.toContain('recent commit subjects')
  })
})
