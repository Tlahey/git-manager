import { describe, expect, it } from 'vitest'
import type { AiContext } from '../config'
import {
  assessCommitMessageCoverage,
  buildCommitUserPrompt,
  COMMIT_MESSAGE_INSTRUCTION,
  commitMessageFeature,
  detectScope,
  truncateDiff,
} from './commitMessage'
import { estimateTokens } from '../promptSize'

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
    const prompt = buildCommitUserPrompt({ context: base })
    expect(prompt).toContain('Repository: demo (branch: main)')
    expect(prompt).toContain('Suggested scope: src')
    expect(prompt).toContain('diff body')
  })

  it('omits the scope hint when files span directories', () => {
    const prompt = buildCommitUserPrompt({
      context: {
        ...base,
        files: [
          { path: 'src/a.ts', status: 'modified' },
          { path: 'docs/b.md', status: 'added' },
        ],
      },
    })
    expect(prompt).not.toContain('Suggested scope:')
  })

  it("injects the project's commit convention when present", () => {
    const prompt = buildCommitUserPrompt({
      context: {
        ...base,
        commitConvention: { source: 'commitlint.config.js', content: 'type-enum: [feat, fix]' },
      },
    })
    expect(prompt).toContain('commitlint.config.js')
    expect(prompt).toContain('type-enum: [feat, fix]')
  })

  it("injects the project's recent commit subjects as the style to imitate", () => {
    const prompt = buildCommitUserPrompt({
      context: { ...base, recentCommits: ['Add login page', 'Fix startup crash'] },
    })
    expect(prompt).toContain('- Add login page')
    expect(prompt).toContain('- Fix startup crash')
  })

  it('adds no style section when the repo has neither convention nor history', () => {
    const prompt = buildCommitUserPrompt({ context: base })
    expect(prompt).not.toContain('OVERRIDES')
    expect(prompt).not.toContain('recent commit subjects')
  })
})

describe('buildCommitUserPrompt — sizing follows the declared window', () => {
  const bulky = (path: string, size: number) =>
    `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n+${'x'.repeat(size)}\n`

  const context = (diff: string, overrides: Partial<AiContext> = {}): AiContext => ({
    diff,
    repoName: 'demo',
    branch: 'main',
    files: [{ path: 'src/a.ts', status: 'modified' }],
    ...overrides,
  })

  const diff = bulky('src/a.ts', 20_000) + bulky('src/b.ts', 20_000) + bulky('src/c.ts', 20_000)

  it('sends more of the diff to a model with a bigger window', () => {
    const small = buildCommitUserPrompt({ context: context(diff), contextTokens: 4096 })
    const large = buildCommitUserPrompt({ context: context(diff), contextTokens: 32768 })
    expect(large.length).toBeGreaterThan(small.length * 3)
  })

  it.each([4096, 8192, 24576])('stays inside a %i-token window', (window) => {
    // The bug this replaces: a flat 4000-character cut ignored the window entirely — the tightest of
    // the six budgets, and on a 32k window it read 4000 characters of a 60 000-character change.
    const prompt = buildCommitUserPrompt({ context: context(diff), contextTokens: window })
    expect(estimateTokens(COMMIT_MESSAGE_INSTRUCTION) + estimateTokens(prompt)).toBeLessThanOrEqual(
      window
    )
  })

  it('pays for a long convention out of the diff, not out of the window', () => {
    // The style section carries the repo's raw commitlint config: real envelope, and before this it
    // was added on top of a fixed diff cut instead of competing with it.
    const diffPart = (p: string) => p.slice(p.indexOf('--- DIFF ---'))
    const verbose = buildCommitUserPrompt({
      context: context(diff, {
        commitConvention: { source: 'commitlint.config.js', content: 'x'.repeat(6000) },
      }),
      contextTokens: 8192,
    })
    const plain = buildCommitUserPrompt({ context: context(diff), contextTokens: 8192 })

    expect(diffPart(verbose).length).toBeLessThan(diffPart(plain).length)
    expect(estimateTokens(COMMIT_MESSAGE_INSTRUCTION) + estimateTokens(verbose)).toBeLessThanOrEqual(
      8192
    )
  })

  it('reads the code before the noise instead of cutting at a fixed offset', () => {
    const noisy = bulky('pnpm-lock.yaml', 60_000) + bulky('src/feature.ts', 4000)
    const prompt = buildCommitUserPrompt({ context: context(noisy), contextTokens: 8192 })
    expect(prompt).toContain(`+${'x'.repeat(4000)}`)
    expect(prompt).toContain('[... pnpm-lock.yaml: truncated')
  })

  it('names what it could not read before the diff, not after it', () => {
    // Load-bearing rather than polite here: these paths are the only thing stopping the model from
    // scoping the subject line to whichever files happened to fit.
    const prompt = buildCommitUserPrompt({ context: context(diff), contextTokens: 4096 })
    expect(prompt.indexOf('NOT INCLUDED')).toBeLessThan(prompt.indexOf('--- DIFF ---'))
  })

  it('says nothing about omitted files when the whole diff fits', () => {
    expect(
      buildCommitUserPrompt({ context: context('diff body'), contextTokens: 32768 })
    ).not.toContain('NOT INCLUDED')
  })
})

describe('assessCommitMessageCoverage', () => {
  const bulky = (path: string, size: number) =>
    `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n+${'x'.repeat(size)}\n`

  const context = (diff: string): AiContext => ({
    diff,
    repoName: 'demo',
    branch: 'main',
    files: [{ path: 'src/a.ts', status: 'modified' }],
  })

  it('reports a small staged change as fully read', () => {
    const diff = bulky('src/a.ts', 200) + bulky('src/b.ts', 200)
    expect(
      assessCommitMessageCoverage({ context: context(diff), contextTokens: 24576 })
    ).toMatchObject({ filesRead: 2, filesTotal: 2, complete: true })
  })

  it('counts what a tight window had to leave out', () => {
    const diff = Array.from({ length: 10 }, (_, i) => bulky(`src/f${i}.ts`, 5000)).join('')
    const coverage = assessCommitMessageCoverage({ context: context(diff), contextTokens: 4096 })
    expect(coverage.filesTotal).toBe(10)
    expect(coverage.filesRead).toBeLessThan(10)
    expect(coverage.complete).toBe(false)
  })

  it('names a window that would actually carry the whole change', () => {
    const diff = Array.from({ length: 10 }, (_, i) => bulky(`src/f${i}.ts`, 5000)).join('')
    const { requiredContextTokens } = assessCommitMessageCoverage({
      context: context(diff),
      contextTokens: 4096,
    })
    expect(
      assessCommitMessageCoverage({ context: context(diff), contextTokens: requiredContextTokens })
        .complete
    ).toBe(true)
  })
})

describe('commitMessageFeature', () => {
  it('forbids the coverage remark a partial diff invites, because the message is committed', () => {
    expect(commitMessageFeature.instruction).toContain('NEVER mention truncation')
    expect(commitMessageFeature.instruction).toContain('COMMITTED')
  })

  it('requires the scope to cover files it could not read', () => {
    // Confidently wrong beats vague here: told only what it read, the model writes `fix(ui)` for a
    // change that also rewrote the backend.
    expect(commitMessageFeature.instruction).toContain(
      'never pick a scope that describes only the files you could read'
    )
  })

  it('forbids inferring that something is missing from a narrow hunk', () => {
    expect(commitMessageFeature.instruction).toContain(
      'Absence of evidence is not evidence of absence'
    )
  })
})
