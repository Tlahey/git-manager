import { describe, it, expect } from 'vitest'
import { FILE_GROUPING_SCHEMA, groupingOutputTokens } from './fileGrouping'
import type { FileSummary } from './fileSummary'
import {
  buildSummaryGroupingPrompt,
  renderSummaryList,
  summaryGroupingFeature,
  summaryGroupingOutputTokens,
  SUMMARY_GROUPING_INSTRUCTION,
} from './summaryGrouping'
import type { SummaryGroupingInput } from './summaryGrouping'

function summary(path: string, area = 'commit batching', intent = 'add a guard'): FileSummary {
  return { path, status: 'modified', area, intent }
}

function input(overrides: Partial<SummaryGroupingInput> = {}): SummaryGroupingInput {
  return {
    repoName: 'demo',
    branch: 'main',
    summaries: [summary('src/a.ts'), summary('src/a.test.ts')],
    ...overrides,
  }
}

describe('buildSummaryGroupingPrompt', () => {
  it('lists every file with its area and intent', () => {
    const prompt = buildSummaryGroupingPrompt(input())
    expect(prompt).toContain('src/a.ts (modified) — [commit batching] add a guard')
    expect(prompt).toContain('src/a.test.ts')
  })

  it('states the file count on both sides of the list, so the model can check itself', () => {
    const prompt = buildSummaryGroupingPrompt(input())
    expect(prompt).toContain('All 2 changed files')
    expect(prompt).toContain('Split these 2 files')
  })

  /**
   * The single-shot prompt has to carry a "NOT INCLUDED — you have not read these" block, which sits
   * a few lines from "every file MUST appear in exactly one commit". Here the evidence is complete
   * by construction, so that contradiction does not exist to be resolved the wrong way.
   */
  it('carries no not-included block, because every file arrives described', () => {
    const prompt = buildSummaryGroupingPrompt(input())
    expect(prompt).not.toContain('NOT INCLUDED')
    expect(SUMMARY_GROUPING_INSTRUCTION).toContain('This list is complete')
  })

  it('injects the project commit style', () => {
    const prompt = buildSummaryGroupingPrompt(
      input({ commitInstructions: 'always mention the ticket id' })
    )
    expect(prompt).toContain('always mention the ticket id')
  })
})

describe('renderSummaryList', () => {
  const many = Array.from({ length: 40 }, (_, i) =>
    summary(
      `apps/desktop/src/components/Panel${i}.tsx`,
      'a fairly long area name',
      'a long intent clause about this file'
    )
  )

  it('keeps intents when there is room', () => {
    expect(renderSummaryList(many, 100_000)).toContain('a long intent clause')
  })

  it('drops the intents before the areas when the budget is tight', () => {
    // One character short of what the full rendering needs, so the next level down is what fits.
    const full = renderSummaryList(many, Number.MAX_SAFE_INTEGER)
    const rendered = renderSummaryList(many, full.length - 1)

    expect(rendered).not.toContain('a long intent clause')
    expect(rendered).toContain('a fairly long area name')
  })

  /** A path missing from the list is a file that cannot be placed at all, so the list itself is the
   * one thing never cut — it degrades to bare paths and stops there. */
  it('never drops a path, even when nothing fits', () => {
    const rendered = renderSummaryList(many, 10)
    for (const s of many) expect(rendered).toContain(s.path)
    expect(rendered).not.toContain('a fairly long area name')
  })
})

describe('summaryGroupingOutputTokens', () => {
  it('reserves the same room the single-shot planner would for the same paths', () => {
    // Both answers are the same document: every path restated, plus a message per commit.
    const summaries = [summary('src/a.ts'), summary('src/b.ts')]
    expect(summaryGroupingOutputTokens(input({ summaries }))).toBe(
      groupingOutputTokens(['src/a.ts', 'src/b.ts'])
    )
  })
})

describe('summaryGroupingFeature', () => {
  it('shares the plan schema with the single-shot planner', () => {
    expect(summaryGroupingFeature.schema).toBe(FILE_GROUPING_SCHEMA)
  })

  it('parses a plan out of the model response', () => {
    expect(
      summaryGroupingFeature.parse('{"commits":[{"commitMessage":"feat: a","files":["src/a.ts"]}]}')
    ).toEqual([{ commitMessage: 'feat: a', files: ['src/a.ts'] }])
  })

  it('asks for the same answer room its prompt held back', () => {
    const value = input()
    expect(summaryGroupingFeature.reservedOutputTokens?.(value)).toBe(
      summaryGroupingOutputTokens(value)
    )
  })
})
