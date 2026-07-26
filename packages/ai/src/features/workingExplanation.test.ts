import { describe, expect, it } from 'vitest'
import type { AiContext } from '../config'
import {
  assessWorkingExplanationCoverage,
  buildWorkingExplanationPrompt,
  workingExplanationFeature,
  WORKING_EXPLANATION_INSTRUCTION,
  type WorkingExplanationInput,
} from './workingExplanation'
import { estimateTokens } from '../promptSize'

const context: AiContext = {
  diff: 'working diff body',
  repoName: 'demo',
  branch: 'feat/login',
  files: [
    { path: 'src/auth/login.ts', status: 'modified' },
    { path: 'src/auth/scratch.ts', status: 'untracked' },
  ],
}

function input(overrides: Partial<WorkingExplanationInput> = {}): WorkingExplanationInput {
  return { context, ...overrides }
}

describe('buildWorkingExplanationPrompt', () => {
  it('names the repo and the branch the work sits on', () => {
    expect(buildWorkingExplanationPrompt(input())).toContain('Repository: demo (branch: feat/login)')
  })

  it('lists the uncommitted files with their statuses', () => {
    const prompt = buildWorkingExplanationPrompt(input())
    expect(prompt).toContain('- src/auth/login.ts (modified)')
    // The untracked status is what tells the model this file is brand new.
    expect(prompt).toContain('- src/auth/scratch.ts (untracked)')
  })

  it('embeds the working diff', () => {
    const prompt = buildWorkingExplanationPrompt(input())
    expect(prompt).toContain('--- DIFF (working tree vs HEAD) ---')
    expect(prompt).toContain('working diff body')
  })

  it('omits the file list when there is none', () => {
    const prompt = buildWorkingExplanationPrompt(input({ context: { ...context, files: [] } }))
    expect(prompt).not.toContain('Uncommitted files:')
  })

  it('asks for English by default and French when the UI language is fr', () => {
    expect(buildWorkingExplanationPrompt(input())).toContain('Write the entire summary in English.')
    expect(buildWorkingExplanationPrompt(input({ language: 'fr' }))).toContain(
      'Write the entire summary in French.'
    )
  })

  it('truncates an oversized diff', () => {
    const prompt = buildWorkingExplanationPrompt(
      input({ context: { ...context, diff: 'x'.repeat(20_000) } })
    )
    expect(prompt).toContain('[diff truncated, showing first')
  })
})

describe('workingExplanationFeature', () => {
  it('is a streaming feature with a low, grounded temperature', () => {
    expect(workingExplanationFeature.kind).toBe('streaming')
    expect(workingExplanationFeature.temperature).toBeLessThanOrEqual(0.3)
  })

  it('asks for the work to be separated rather than merged into one story', () => {
    expect(workingExplanationFeature.instruction).toContain('Separating them')
  })
})

describe('buildWorkingExplanationPrompt — sizing follows the declared window', () => {
  const bulky = (path: string, size: number) =>
    `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n+${'x'.repeat(size)}\n`
  const diff = bulky('src/a.ts', 20_000) + bulky('src/b.ts', 20_000) + bulky('src/c.ts', 20_000)
  const big = (overrides: Partial<AiContext> = {}) => ({ ...context, diff, ...overrides })

  it('sends more of the diff to a model with a bigger window', () => {
    const small = buildWorkingExplanationPrompt(input({ context: big(), contextTokens: 4096 }))
    const large = buildWorkingExplanationPrompt(input({ context: big(), contextTokens: 32768 }))
    expect(large.length).toBeGreaterThan(small.length * 3)
  })

  it.each([4096, 8192, 24576])('stays inside a %i-token window', (window) => {
    const prompt = buildWorkingExplanationPrompt(input({ context: big(), contextTokens: window }))
    expect(
      estimateTokens(WORKING_EXPLANATION_INSTRUCTION) + estimateTokens(prompt)
    ).toBeLessThanOrEqual(window)
  })

  it('keeps the file list when the diff has to shrink — it is what the count comes from', () => {
    // The stake specific to this feature: the answer says how many separate things are in progress,
    // and that number comes from the list. A model shown a third of the files names a third of the
    // work, confidently.
    const many = Array.from({ length: 40 }, (_, i) => `src/f${i}.ts`)
    const prompt = buildWorkingExplanationPrompt(
      input({
        context: big({
          diff: many.map((p) => bulky(p, 5000)).join(''),
          files: many.map((path) => ({ path, status: 'modified' })),
        }),
        contextTokens: 4096,
      })
    )
    expect(prompt).toContain('src/f0.ts (modified)')
    expect(prompt).toContain('src/f39.ts (modified)')
  })

  it('reads the code before the noise instead of cutting at a fixed offset', () => {
    const noisy = bulky('pnpm-lock.yaml', 60_000) + bulky('src/feature.ts', 4000)
    const prompt = buildWorkingExplanationPrompt(
      input({ context: big({ diff: noisy }), contextTokens: 8192 })
    )
    expect(prompt).toContain(`+${'x'.repeat(4000)}`)
    expect(prompt).toContain('[... pnpm-lock.yaml: truncated')
  })

  it('names what it could not read before the diff, not after it', () => {
    const prompt = buildWorkingExplanationPrompt(input({ context: big(), contextTokens: 4096 }))
    expect(prompt.indexOf('NOT INCLUDED')).toBeLessThan(prompt.indexOf('--- DIFF'))
  })

  it('says nothing about omitted files when the whole diff fits', () => {
    expect(buildWorkingExplanationPrompt(input({ contextTokens: 32768 }))).not.toContain(
      'NOT INCLUDED'
    )
  })
})

describe('assessWorkingExplanationCoverage', () => {
  const bulky = (path: string, size: number) =>
    `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n+${'x'.repeat(size)}\n`

  it('reports a small working tree as fully read', () => {
    const diff = bulky('src/a.ts', 200) + bulky('src/b.ts', 200)
    expect(
      assessWorkingExplanationCoverage(
        input({ context: { ...context, diff }, contextTokens: 24576 })
      )
    ).toMatchObject({ filesRead: 2, filesTotal: 2, complete: true })
  })

  it('counts what a tight window had to leave out', () => {
    const diff = Array.from({ length: 10 }, (_, i) => bulky(`src/f${i}.ts`, 5000)).join('')
    const coverage = assessWorkingExplanationCoverage(
      input({ context: { ...context, diff }, contextTokens: 4096 })
    )
    expect(coverage.filesTotal).toBe(10)
    expect(coverage.filesRead).toBeLessThan(10)
    expect(coverage.complete).toBe(false)
  })

  it('names a window that would actually carry the whole tree', () => {
    const diff = Array.from({ length: 10 }, (_, i) => bulky(`src/f${i}.ts`, 5000)).join('')
    const { requiredContextTokens } = assessWorkingExplanationCoverage(
      input({ context: { ...context, diff }, contextTokens: 4096 })
    )
    expect(
      assessWorkingExplanationCoverage(
        input({ context: { ...context, diff }, contextTokens: requiredContextTokens })
      ).complete
    ).toBe(true)
  })
})

describe('workingExplanationFeature — what it may say about coverage', () => {
  it('bans the coverage remark', () => {
    expect(workingExplanationFeature.instruction).toContain('NEVER mention truncation')
  })

  it('makes the file list the authority on how many pieces of work there are', () => {
    expect(workingExplanationFeature.instruction).toContain(
      'It — not the diff — tells you how many separate pieces of work'
    )
  })

  it('forbids inferring that something is missing from a narrow hunk', () => {
    expect(workingExplanationFeature.instruction).toContain(
      'Absence of evidence is not evidence of absence'
    )
  })
})
