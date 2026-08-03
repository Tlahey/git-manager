import { describe, it, expect } from 'vitest'
import type { FileSummary } from './fileSummary'
import {
  buildSummaryExplanationPrompt,
  summaryExplanationFeature,
  SUMMARY_EXPLANATION_INSTRUCTION,
} from './summaryExplanation'
import type { SummaryExplanationInput } from './summaryExplanation'

const summaries: FileSummary[] = [
  { path: 'src/a.ts', status: 'modified', area: 'authentication', intent: 'add the login form' },
  { path: 'src/a.test.ts', status: 'added', area: 'authentication', intent: 'cover it' },
]

function branchInput(overrides: Partial<SummaryExplanationInput> = {}): SummaryExplanationInput {
  return {
    scope: 'branch',
    repoName: 'demo',
    branch: 'feature/login',
    branchCommits: ['feat: add login', 'test: cover login'],
    summaries,
    ...overrides,
  }
}

function commitInput(overrides: Partial<SummaryExplanationInput> = {}): SummaryExplanationInput {
  return {
    scope: 'commit',
    repoName: 'demo',
    commit: { shortOid: 'abc1234', subject: 'feat: add login', body: 'Because the old one broke.' },
    summaries,
    ...overrides,
  }
}

describe('buildSummaryExplanationPrompt', () => {
  it('names the branch and its commits for branch scope', () => {
    const prompt = buildSummaryExplanationPrompt(branchInput())
    expect(prompt).toContain('Branch: feature/login')
    expect(prompt).toContain('- feat: add login')
    expect(prompt).toContain('Explain branch `feature/login`')
  })

  it('names the commit and carries its own message for commit scope', () => {
    const prompt = buildSummaryExplanationPrompt(commitInput())
    expect(prompt).toContain('Commit abc1234: feat: add login')
    expect(prompt).toContain('Because the old one broke.')
    expect(prompt).toContain('Explain this commit')
    // The branch header has no business here.
    expect(prompt).not.toContain('Branch:')
  })

  it('lists every file with its area and intent, whichever scope', () => {
    for (const input of [branchInput(), commitInput()]) {
      const prompt = buildSummaryExplanationPrompt(input)
      expect(prompt).toContain('src/a.ts (modified) — [authentication] add the login form')
      expect(prompt).toContain('All 2 changed files')
    }
  })

  it('asks for the answer in the configured language', () => {
    expect(buildSummaryExplanationPrompt(branchInput({ language: 'fr' }))).toContain('in French')
    expect(buildSummaryExplanationPrompt(branchInput())).toContain('in English')
  })

  it('carries no not-included block, because every file arrives described', () => {
    expect(buildSummaryExplanationPrompt(branchInput())).not.toContain('NOT INCLUDED')
  })
})

describe('SUMMARY_EXPLANATION_INSTRUCTION', () => {
  /**
   * The rule each replaced instruction needed only because the model *was* shown a fraction and
   * would otherwise open with an apology for it. With complete evidence there is nothing to hide.
   */
  it('has no rule forbidding talk of truncation, because there is none to talk about', () => {
    expect(SUMMARY_EXPLANATION_INSTRUCTION).not.toMatch(/truncation|budget/i)
    expect(SUMMARY_EXPLANATION_INSTRUCTION).toContain('This list is complete')
  })

  it('keeps the two rules worth keeping from both features it replaces', () => {
    // Explaining is not reviewing, and a diff you cannot see is not a diff that is missing.
    expect(SUMMARY_EXPLANATION_INSTRUCTION).toContain('Describe, do not review')
    expect(SUMMARY_EXPLANATION_INSTRUCTION).toContain(
      'Absence of evidence is not evidence of absence'
    )
  })

  it('tells a commit explanation not to parrot the commit message back', () => {
    expect(SUMMARY_EXPLANATION_INSTRUCTION).toMatch(/do not paraphrase its own message back/)
  })
})

describe('summaryExplanationFeature', () => {
  it('streams, because the answer is prose a reader watches arrive', () => {
    expect(summaryExplanationFeature.kind).toBe('streaming')
  })

  it('takes the ordinary prose reserve — one explanation, whatever it covers', () => {
    expect(summaryExplanationFeature.reservedOutputTokens).toBeUndefined()
  })
})
