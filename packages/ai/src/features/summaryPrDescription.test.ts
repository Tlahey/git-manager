import { describe, it, expect } from 'vitest'
import type { FileSummary } from './fileSummary'
import {
  buildSummaryPrDescriptionPrompt,
  summaryPrDescriptionFeature,
  SUMMARY_PR_DESCRIPTION_INSTRUCTION,
} from './summaryPrDescription'
import type { SummaryPrDescriptionInput } from './summaryPrDescription'

const summaries: FileSummary[] = [
  { path: 'src/a.ts', status: 'modified', area: 'authentication', intent: 'add the login form' },
  { path: 'src/a.test.ts', status: 'added', area: 'authentication', intent: 'cover it' },
]

function input(overrides: Partial<SummaryPrDescriptionInput> = {}): SummaryPrDescriptionInput {
  return {
    repoName: 'demo',
    branch: 'feature/login',
    baseRef: 'main',
    branchCommits: ['feat: add login'],
    summaries,
    templateContent: null,
    ...overrides,
  }
}

describe('buildSummaryPrDescriptionPrompt', () => {
  it('names the branch, its base and its commits', () => {
    const prompt = buildSummaryPrDescriptionPrompt(input())
    expect(prompt).toContain('Branch: feature/login → base: main')
    expect(prompt).toContain('- feat: add login')
  })

  it('lists every file with its area and intent', () => {
    const prompt = buildSummaryPrDescriptionPrompt(input())
    expect(prompt).toContain('src/a.ts (modified) — [authentication] add the login form')
    expect(prompt).toContain('All 2 changed files')
  })

  it('carries the template verbatim when the repo ships one', () => {
    const prompt = buildSummaryPrDescriptionPrompt(
      input({ templateContent: '## Why\n<!-- explain -->' })
    )
    expect(prompt).toContain('--- TEMPLATE ---')
    expect(prompt).toContain('## Why\n<!-- explain -->')
  })

  it('asks for the default structure when there is no template', () => {
    expect(buildSummaryPrDescriptionPrompt(input())).toContain('No template is provided')
  })

  /**
   * The template used to be budgeted out of the same pool as the range diff, so on a small window
   * the feature's most visible rule could be the thing that fell out of the prompt's start. Nothing
   * competes with it now but a list of one-line summaries.
   */
  it('keeps the whole template even beside a large file list on a small window', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      path: `src/very/deeply/nested/module/File${i}.ts`,
      status: 'modified',
      area: 'a fairly long area name',
      intent: 'a long intent clause about this particular file',
    }))
    const template = '## Why\n<!-- explain -->\n## Test plan\n<!-- how -->'
    const prompt = buildSummaryPrDescriptionPrompt(
      input({ summaries: many, templateContent: template, contextTokens: 4096 })
    )
    expect(prompt).toContain(template)
    // And every path survives too — a PR body that omits a file describes the wrong change.
    for (const s of many) expect(prompt).toContain(s.path)
  })
})

describe('SUMMARY_PR_DESCRIPTION_INSTRUCTION', () => {
  it('still guards the published output, the reason this is not an explanation', () => {
    expect(SUMMARY_PR_DESCRIPTION_INSTRUCTION).toContain('PUBLISHED')
    expect(SUMMARY_PR_DESCRIPTION_INSTRUCTION).toMatch(/Never mention these summaries/)
  })

  it('keeps the template rules intact', () => {
    expect(SUMMARY_PR_DESCRIPTION_INSTRUCTION).toMatch(/keep every heading and structural element/)
  })

  it('has no rule about truncation, because nothing is truncated', () => {
    expect(SUMMARY_PR_DESCRIPTION_INSTRUCTION).not.toMatch(/truncation|context window/i)
  })
})

describe('summaryPrDescriptionFeature', () => {
  it('streams, and keeps the prose latitude the description had', () => {
    expect(summaryPrDescriptionFeature.kind).toBe('streaming')
    expect(summaryPrDescriptionFeature.temperature).toBe(0.4)
  })
})
