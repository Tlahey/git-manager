import { describe, it, expect } from 'vitest'
import { COMMIT_MESSAGE_SCHEMA } from './commitMessage'
import type { FileSummary } from './fileSummary'
import {
  buildSummaryCommitMessagePrompt,
  summaryCommitMessageFeature,
  SUMMARY_COMMIT_MESSAGE_INSTRUCTION,
} from './summaryCommitMessage'
import type { SummaryCommitMessageInput } from './summaryCommitMessage'

function summary(path: string, area = 'commit batching', intent = 'add a guard'): FileSummary {
  return { path, status: 'modified', area, intent }
}

function input(overrides: Partial<SummaryCommitMessageInput> = {}): SummaryCommitMessageInput {
  return {
    repoName: 'demo',
    branch: 'main',
    summaries: [summary('src/a.ts'), summary('src/a.test.ts')],
    ...overrides,
  }
}

describe('buildSummaryCommitMessagePrompt', () => {
  it('lists every staged file with its area and intent', () => {
    const prompt = buildSummaryCommitMessagePrompt(input())
    expect(prompt).toContain('src/a.ts (modified) — [commit batching] add a guard')
    expect(prompt).toContain('All 2 staged files')
  })

  it('injects the project commit style', () => {
    const prompt = buildSummaryCommitMessagePrompt(
      input({ commitInstructions: 'always mention the ticket id' })
    )
    expect(prompt).toContain('always mention the ticket id')
  })

  it('carries no not-included block, because every file arrives described', () => {
    expect(buildSummaryCommitMessagePrompt(input())).not.toContain('NOT INCLUDED')
    expect(SUMMARY_COMMIT_MESSAGE_INSTRUCTION).toContain('This list is complete')
  })
})

describe('SUMMARY_COMMIT_MESSAGE_INSTRUCTION', () => {
  /**
   * The single-shot feature's specific failure: given a change too large for the window it read
   * whichever files sorted first and wrote a subject about those, so a change that also rewrote the
   * backend was committed as `fix(ui): …` — permanently, and looking deliberate.
   */
  it('asks for a type covering the change as a whole', () => {
    expect(SUMMARY_COMMIT_MESSAGE_INSTRUCTION).toContain('reflects the change as a whole')
  })

  it('forbids mentioning the summaries — the message is a commit, not a report', () => {
    expect(SUMMARY_COMMIT_MESSAGE_INSTRUCTION).toMatch(/Never mention these summaries/)
  })
})

describe('summaryCommitMessageFeature', () => {
  it('shares the message schema with the single-shot feature', () => {
    // Same document, different evidence — and the schema is what keeps a reasoning model's
    // deliberation out of the commit box either way.
    expect(summaryCommitMessageFeature.schema).toBe(COMMIT_MESSAGE_SCHEMA)
  })

  it('parses a draft out of the model response', () => {
    expect(summaryCommitMessageFeature.parse('{"subject":"feat: a","body":"why"}')).toEqual({
      subject: 'feat: a',
      body: 'why',
    })
  })

  /** Unlike the commit *plan*, one message is one message whether it covers 12 files or 200. */
  it('takes the ordinary prose reserve, not one that scales with the input', () => {
    expect(summaryCommitMessageFeature.reservedOutputTokens).toBeUndefined()
  })
})
