import { describe, expect, it } from 'vitest'
import type { AiContext } from '../config'
import {
  assessPrDescriptionCoverage,
  buildPrDescriptionUserPrompt,
  prDescriptionFeature,
  PR_DESCRIPTION_INSTRUCTION,
  type PrDescriptionInput,
} from './prDescription'
import { estimateTokens } from '../promptSize'

const context: AiContext = {
  diff: 'diff body here',
  repoName: 'demo',
  branch: 'feat/login',
  files: [{ path: 'src/a.ts', status: 'modified' }],
  baseRef: 'main',
  rangeCommits: ['feat: add login page', 'fix: handle empty password'],
}

function input(overrides: Partial<PrDescriptionInput> = {}): PrDescriptionInput {
  return { context, templateContent: null, ...overrides }
}

describe('buildPrDescriptionUserPrompt', () => {
  it('includes the repo, branch, base ref and the range commits', () => {
    const prompt = buildPrDescriptionUserPrompt(input())
    expect(prompt).toContain('Repository: demo')
    expect(prompt).toContain('Branch: feat/login → base: main')
    expect(prompt).toContain('- feat: add login page')
    expect(prompt).toContain('- fix: handle empty password')
    expect(prompt).toContain('diff body here')
  })

  it('asks for the default structure when no template is provided', () => {
    const prompt = buildPrDescriptionUserPrompt(input({ templateContent: null }))
    expect(prompt).toContain('No template is provided')
    expect(prompt).not.toContain('--- TEMPLATE ---')
  })

  it('embeds the template to fill in when one is provided', () => {
    const prompt = buildPrDescriptionUserPrompt(
      input({ templateContent: '## Summary\n\n## Checklist\n- [ ] tests' })
    )
    expect(prompt).toContain('Fill in the following pull-request template')
    expect(prompt).toContain('## Checklist')
    expect(prompt).not.toContain('No template is provided')
  })

  it('treats a whitespace-only template as no template', () => {
    const prompt = buildPrDescriptionUserPrompt(input({ templateContent: '   \n  ' }))
    expect(prompt).toContain('No template is provided')
  })

  it('truncates an oversized diff', () => {
    const prompt = buildPrDescriptionUserPrompt(
      input({ context: { ...context, diff: 'x'.repeat(20_000) } })
    )
    expect(prompt).toContain('[diff truncated, showing first')
  })

  it('omits the commit list when there are no range commits', () => {
    const prompt = buildPrDescriptionUserPrompt(
      input({ context: { ...context, rangeCommits: [] } })
    )
    expect(prompt).not.toContain('Commits in this pull request')
  })
})

describe('prDescriptionFeature', () => {
  it('is a streaming feature with a bounded temperature', () => {
    expect(prDescriptionFeature.kind).toBe('streaming')
    expect(prDescriptionFeature.temperature).toBeGreaterThan(0)
    expect(prDescriptionFeature.temperature).toBeLessThanOrEqual(0.5)
  })
})

describe('buildPrDescriptionUserPrompt — sizing follows the declared window', () => {
  const bulky = (path: string, size: number) =>
    `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n+${'x'.repeat(size)}\n`
  const diff = bulky('src/a.ts', 20_000) + bulky('src/b.ts', 20_000) + bulky('src/c.ts', 20_000)
  const big = (overrides: Partial<AiContext> = {}) => ({ ...context, diff, ...overrides })

  it('sends more of the diff to a model with a bigger window', () => {
    const small = buildPrDescriptionUserPrompt(input({ context: big(), contextTokens: 4096 }))
    const large = buildPrDescriptionUserPrompt(input({ context: big(), contextTokens: 32768 }))
    expect(large.length).toBeGreaterThan(small.length * 3)
  })

  it.each([4096, 8192, 24576])('stays inside a %i-token window', (window) => {
    const prompt = buildPrDescriptionUserPrompt(input({ context: big(), contextTokens: window }))
    expect(
      estimateTokens(PR_DESCRIPTION_INSTRUCTION) + estimateTokens(prompt)
    ).toBeLessThanOrEqual(window)
  })

  it('pays for a long template out of the diff, and still fits the window', () => {
    // The template is written after the diff yet is budgeted with the header: size is what matters
    // to a budget, not order. Some repos ship a checklist per area, several hundred tokens.
    const diffPart = (p: string) => p.slice(p.indexOf('--- DIFF'), p.indexOf('--- END DIFF ---'))
    const templated = buildPrDescriptionUserPrompt(
      input({ context: big(), templateContent: '- [ ] a checklist item\n'.repeat(300), contextTokens: 8192 })
    )
    const plain = buildPrDescriptionUserPrompt(input({ context: big(), contextTokens: 8192 }))

    expect(diffPart(templated).length).toBeLessThan(diffPart(plain).length)
    expect(
      estimateTokens(PR_DESCRIPTION_INSTRUCTION) + estimateTokens(templated)
    ).toBeLessThanOrEqual(8192)
  })

  it('keeps the template intact — it is what the model is told to reproduce exactly', () => {
    const template = '## Summary\n<!-- describe -->\n## Risk\n<!-- rate it -->'
    const prompt = buildPrDescriptionUserPrompt(
      input({ context: big(), templateContent: template, contextTokens: 4096 })
    )
    expect(prompt).toContain(template)
  })

  it('reads the code before the noise instead of cutting at a fixed offset', () => {
    const noisy = bulky('pnpm-lock.yaml', 60_000) + bulky('src/feature.ts', 4000)
    const prompt = buildPrDescriptionUserPrompt(
      input({ context: big({ diff: noisy }), contextTokens: 8192 })
    )
    expect(prompt).toContain(`+${'x'.repeat(4000)}`)
    expect(prompt).toContain('[... pnpm-lock.yaml: truncated')
  })

  it('names what it could not read before the diff, not after it', () => {
    const prompt = buildPrDescriptionUserPrompt(input({ context: big(), contextTokens: 4096 }))
    expect(prompt.indexOf('NOT INCLUDED')).toBeLessThan(prompt.indexOf('--- DIFF'))
  })

  it('says nothing about omitted files when the whole diff fits', () => {
    expect(buildPrDescriptionUserPrompt(input({ contextTokens: 32768 }))).not.toContain(
      'NOT INCLUDED'
    )
  })
})

describe('assessPrDescriptionCoverage', () => {
  const bulky = (path: string, size: number) =>
    `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n+${'x'.repeat(size)}\n`

  it('reports a small branch as fully read', () => {
    const diff = bulky('src/a.ts', 200) + bulky('src/b.ts', 200)
    expect(
      assessPrDescriptionCoverage(input({ context: { ...context, diff }, contextTokens: 24576 }))
    ).toMatchObject({ filesRead: 2, filesTotal: 2, complete: true })
  })

  it('counts what a tight window had to leave out', () => {
    const diff = Array.from({ length: 10 }, (_, i) => bulky(`src/f${i}.ts`, 5000)).join('')
    const coverage = assessPrDescriptionCoverage(
      input({ context: { ...context, diff }, contextTokens: 4096 })
    )
    expect(coverage.filesTotal).toBe(10)
    expect(coverage.filesRead).toBeLessThan(10)
    expect(coverage.complete).toBe(false)
  })

  it('charges the template to the diff, so a long one costs files read', () => {
    // A repo with a long template genuinely leaves less room for the same branch. Asserted on files
    // read rather than on `requiredContextTokens`, which is deliberately rounded up to the next
    // window people actually configure and so absorbs a difference this size.
    const diff = Array.from({ length: 10 }, (_, i) => bulky(`src/f${i}.ts`, 5000)).join('')
    const plain = assessPrDescriptionCoverage(
      input({ context: { ...context, diff }, contextTokens: 16384 })
    )
    const templated = assessPrDescriptionCoverage(
      input({
        context: { ...context, diff },
        templateContent: '- [ ] a checklist item\n'.repeat(600),
        contextTokens: 16384,
      })
    )
    expect(templated.filesRead).toBeLessThan(plain.filesRead)
  })

  it('names a window that would actually carry the whole branch', () => {
    const diff = Array.from({ length: 10 }, (_, i) => bulky(`src/f${i}.ts`, 5000)).join('')
    const { requiredContextTokens } = assessPrDescriptionCoverage(
      input({ context: { ...context, diff }, contextTokens: 4096 })
    )
    expect(
      assessPrDescriptionCoverage(
        input({ context: { ...context, diff }, contextTokens: requiredContextTokens })
      ).complete
    ).toBe(true)
  })
})

describe('prDescriptionFeature — what it may say about coverage', () => {
  it('bans the coverage remark outright, because this output gets published', () => {
    expect(prDescriptionFeature.instruction).toContain('will be PUBLISHED')
    expect(prDescriptionFeature.instruction).toContain('NEVER mention truncation')
  })

  it('tells the model the commit and file lists stay complete when the diff does not', () => {
    expect(prDescriptionFeature.instruction).toContain('COMPLETE even when the diff is not')
  })

  it('forbids inferring that something is missing from a narrow hunk', () => {
    expect(prDescriptionFeature.instruction).toContain(
      'Absence of evidence is not evidence of absence'
    )
  })
})
