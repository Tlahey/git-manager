import { describe, expect, it } from 'vitest'
import type { AiContext } from '../config'
import {
  assessBranchExplanationCoverage,
  branchExplanationFeature,
  BRANCH_EXPLANATION_INSTRUCTION,
  buildBranchExplanationPrompt,
  type BranchExplanationInput,
} from './branchExplanation'
import { estimateTokens } from '../promptSize'

const context: AiContext = {
  diff: 'diff body here',
  repoName: 'demo',
  branch: 'feat/login',
  files: [
    { path: 'src/auth/login.ts', status: 'modified' },
    { path: 'src/auth/session.ts', status: 'added' },
  ],
  baseRef: 'origin/main',
  rangeCommits: ['feat: add login page', 'fix: handle empty password'],
}

function input(overrides: Partial<BranchExplanationInput> = {}): BranchExplanationInput {
  return { context, ...overrides }
}

describe('buildBranchExplanationPrompt', () => {
  it('names the branch and the base it is compared against', () => {
    const prompt = buildBranchExplanationPrompt(input())
    expect(prompt).toContain('Repository: demo')
    expect(prompt).toContain('Branch: feat/login (compared against origin/main)')
  })

  it('lists the branch commits and the changed files', () => {
    const prompt = buildBranchExplanationPrompt(input())
    expect(prompt).toContain('- feat: add login page')
    expect(prompt).toContain('- fix: handle empty password')
    expect(prompt).toContain('- src/auth/session.ts (added)')
  })

  it('embeds the range diff', () => {
    expect(buildBranchExplanationPrompt(input())).toContain('diff body here')
  })

  it('says so plainly when the branch has no commits of its own', () => {
    const prompt = buildBranchExplanationPrompt(
      input({ context: { ...context, rangeCommits: [] } })
    )
    expect(prompt).toContain('No commits of its own')
    expect(prompt).not.toContain('Commits on this branch')
  })

  it('omits the base clause when the context carries no base ref', () => {
    const prompt = buildBranchExplanationPrompt(
      input({ context: { ...context, baseRef: undefined } })
    )
    expect(prompt).toContain('Branch: feat/login\n')
    expect(prompt).not.toContain('compared against')
  })

  it('asks for English by default and for French when the UI language is fr', () => {
    expect(buildBranchExplanationPrompt(input())).toContain(
      'Write the entire explanation in English.'
    )
    expect(buildBranchExplanationPrompt(input({ language: 'fr' }))).toContain(
      'Write the entire explanation in French.'
    )
  })

  it('falls back to a plain cut for a range diff with no file structure', () => {
    // Sized against the window now rather than cut at a fixed 8000 characters, so the marker no
    // longer names a constant — what matters is that shapeless diff text is still cut and marked.
    const prompt = buildBranchExplanationPrompt(
      input({ context: { ...context, diff: 'x'.repeat(20_000) } })
    )
    expect(prompt).toContain('[diff truncated, showing first')
  })
})

describe('branchExplanationFeature', () => {
  it('is a streaming feature with a low, grounded temperature', () => {
    expect(branchExplanationFeature.kind).toBe('streaming')
    expect(branchExplanationFeature.temperature).toBeGreaterThan(0)
    expect(branchExplanationFeature.temperature).toBeLessThanOrEqual(0.3)
  })

  it('asks for a describe-only answer, not a review', () => {
    expect(branchExplanationFeature.instruction).toContain('Describe, do not review')
  })
})

describe('buildBranchExplanationPrompt — sizing follows the declared window', () => {
  const bulky = (path: string, size: number) =>
    `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n+${'x'.repeat(size)}\n`
  const diff = bulky('src/a.ts', 20_000) + bulky('src/b.ts', 20_000) + bulky('src/c.ts', 20_000)
  const big = (overrides: Partial<AiContext> = {}) => ({ ...context, diff, ...overrides })

  it('sends more of the diff to a model with a bigger window', () => {
    const small = buildBranchExplanationPrompt(input({ context: big(), contextTokens: 4096 }))
    const large = buildBranchExplanationPrompt(input({ context: big(), contextTokens: 32768 }))
    expect(large.length).toBeGreaterThan(small.length * 3)
  })

  it.each([4096, 8192, 24576])('stays inside a %i-token window', (window) => {
    // The bug this replaces: a flat 8000-character cut ignored the window, so a stock Ollama got a
    // prompt that overflowed — dropping tokens from the start, where the instruction lives.
    const prompt = buildBranchExplanationPrompt(input({ context: big(), contextTokens: window }))
    expect(
      estimateTokens(BRANCH_EXPLANATION_INSTRUCTION) + estimateTokens(prompt)
    ).toBeLessThanOrEqual(window)
  })

  it('pays for a long commit list out of the diff, not out of the window', () => {
    // A long-running branch's commit list is envelope, and runs to hundreds of tokens before a
    // single diff line is added.
    const diffPart = (p: string) => p.slice(p.indexOf('--- DIFF'))
    const many = Array.from({ length: 120 }, (_, i) => `feat: change number ${i} on this branch`)
    const long = buildBranchExplanationPrompt(
      input({ context: big({ rangeCommits: many }), contextTokens: 8192 })
    )
    const short = buildBranchExplanationPrompt(input({ context: big(), contextTokens: 8192 }))

    expect(diffPart(long).length).toBeLessThan(diffPart(short).length)
    expect(
      estimateTokens(BRANCH_EXPLANATION_INSTRUCTION) + estimateTokens(long)
    ).toBeLessThanOrEqual(8192)
  })

  it('reads the code before the noise instead of cutting at a fixed offset', () => {
    const noisy = bulky('pnpm-lock.yaml', 60_000) + bulky('src/feature.ts', 4000)
    const prompt = buildBranchExplanationPrompt(
      input({ context: big({ diff: noisy }), contextTokens: 8192 })
    )
    expect(prompt).toContain(`+${'x'.repeat(4000)}`)
    expect(prompt).toContain('[... pnpm-lock.yaml: truncated')
  })

  it('names what it could not read before the diff, not after it', () => {
    const prompt = buildBranchExplanationPrompt(input({ context: big(), contextTokens: 4096 }))
    expect(prompt.indexOf('NOT INCLUDED')).toBeLessThan(prompt.indexOf('--- DIFF'))
  })

  it('says nothing about omitted files when the whole diff fits', () => {
    expect(buildBranchExplanationPrompt(input({ contextTokens: 32768 }))).not.toContain(
      'NOT INCLUDED'
    )
  })
})

describe('assessBranchExplanationCoverage', () => {
  const bulky = (path: string, size: number) =>
    `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n+${'x'.repeat(size)}\n`

  it('reports a small branch as fully read', () => {
    const diff = bulky('src/a.ts', 200) + bulky('src/b.ts', 200)
    expect(
      assessBranchExplanationCoverage(input({ context: { ...context, diff }, contextTokens: 24576 }))
    ).toMatchObject({ filesRead: 2, filesTotal: 2, complete: true })
  })

  it('counts what a tight window had to leave out of a large branch', () => {
    const diff = Array.from({ length: 10 }, (_, i) => bulky(`src/f${i}.ts`, 5000)).join('')
    const coverage = assessBranchExplanationCoverage(
      input({ context: { ...context, diff }, contextTokens: 4096 })
    )
    expect(coverage.filesTotal).toBe(10)
    expect(coverage.filesRead).toBeLessThan(10)
    expect(coverage.complete).toBe(false)
  })

  it('names a window that would actually carry the whole branch', () => {
    const diff = Array.from({ length: 10 }, (_, i) => bulky(`src/f${i}.ts`, 5000)).join('')
    const { requiredContextTokens } = assessBranchExplanationCoverage(
      input({ context: { ...context, diff }, contextTokens: 4096 })
    )
    expect(
      assessBranchExplanationCoverage(
        input({ context: { ...context, diff }, contextTokens: requiredContextTokens })
      ).complete
    ).toBe(true)
  })
})

describe('branchExplanationFeature — what it may say about coverage', () => {
  it('bans the coverage remark its own instruction used to invite', () => {
    // The reversal: this instruction used to say "if the diff was truncated, say what you could not
    // see". On a branch — the largest diff the app sends — that made truncation near-permanently the
    // subject, and the panel already reports it exactly.
    expect(branchExplanationFeature.instruction).toContain('NEVER mention truncation')
    expect(branchExplanationFeature.instruction).not.toContain('say what you could not see')
  })

  it('keeps the opening sentence about the work, not about the prompt', () => {
    expect(branchExplanationFeature.instruction).toContain('That sentence is about THE WORK')
  })

  it('forbids inferring that something is missing from a narrow hunk', () => {
    expect(branchExplanationFeature.instruction).toContain(
      'Absence of evidence is not evidence of absence'
    )
  })

  it('tells the model the commit and file lists stay complete when the diff does not', () => {
    expect(branchExplanationFeature.instruction).toContain('COMPLETE even when the diff is not')
  })
})
