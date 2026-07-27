import { describe, it, expect, vi } from 'vitest'
import type { AiContext } from '../config'
import { planCommitsFromSummaries } from './planCommits'
import type { CommitPlanRunners } from './planCommits'
import {
  shouldSummarizePerFile,
  SummaryRunCancelled,
  SUMMARY_FILE_THRESHOLD,
} from './summarizeFiles'
import type { SummaryProgress } from './summarizeFiles'
import type { SummaryGroupingInput } from './summaryGrouping'

function context(paths: string[], diff = ''): AiContext {
  return {
    diff,
    repoName: 'demo',
    branch: 'main',
    files: paths.map((path) => ({ path, status: 'modified' })),
  }
}

function runners(overrides: Partial<CommitPlanRunners> = {}): CommitPlanRunners {
  return {
    summarize: vi.fn(async ({ path }) => ({ intent: `changes ${path}`, area: 'demo area' })),
    group: vi.fn(async () => [{ commitMessage: 'feat: everything', files: ['a.ts'] }]),
    ...overrides,
  }
}

describe('shouldSummarizePerFile', () => {
  it('leaves a small changeset to the single-shot planner', () => {
    // One call beats N+1 when the whole diff already fits, and it reads the real code rather than a
    // description of it.
    expect(shouldSummarizePerFile(context(['a.ts']))).toBe(false)
    expect(
      shouldSummarizePerFile(
        context(Array.from({ length: SUMMARY_FILE_THRESHOLD }, (_, i) => `f${i}.ts`))
      )
    ).toBe(false)
  })

  it('takes over past the threshold', () => {
    const paths = Array.from({ length: SUMMARY_FILE_THRESHOLD + 1 }, (_, i) => `f${i}.ts`)
    expect(shouldSummarizePerFile(context(paths))).toBe(true)
  })
})

describe('planCommitsFromSummaries', () => {
  it('summarizes every file, then groups the summaries', async () => {
    const r = runners()
    await planCommitsFromSummaries({ context: context(['a.ts', 'b.ts']) }, r)

    expect(r.summarize).toHaveBeenCalledTimes(2)
    const groupInput = (r.group as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as SummaryGroupingInput
    expect(groupInput.summaries).toEqual([
      { path: 'a.ts', status: 'modified', intent: 'changes a.ts', area: 'demo area' },
      { path: 'b.ts', status: 'modified', intent: 'changes b.ts', area: 'demo area' },
    ])
  })

  it('hands each file only its own slice of the working diff', async () => {
    const diff = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '+first file',
      'diff --git a/b.ts b/b.ts',
      '--- a/b.ts',
      '+++ b/b.ts',
      '+second file',
    ].join('\n')
    const r = runners()
    await planCommitsFromSummaries({ context: context(['a.ts', 'b.ts'], diff) }, r)

    const calls = (r.summarize as ReturnType<typeof vi.fn>).mock.calls
    expect(calls[0][0].diff).toContain('+first file')
    expect(calls[0][0].diff).not.toContain('+second file')
    expect(calls[1][0].diff).toContain('+second file')
  })

  /**
   * The failure this whole path exists to avoid is a file going missing, so one that could not be
   * described must still reach the grouping call — the instruction has a rule for placing it from
   * its path.
   */
  it('keeps a file whose summary call failed, with empty fields', async () => {
    const r = runners({
      summarize: vi.fn(async ({ path }) => {
        if (path === 'b.ts') throw new Error('model died')
        return { intent: 'changes it', area: 'demo area' }
      }),
    })

    await planCommitsFromSummaries({ context: context(['a.ts', 'b.ts', 'c.ts']) }, r)

    const groupInput = (r.group as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as SummaryGroupingInput
    expect(groupInput.summaries.map((s) => s.path)).toEqual(['a.ts', 'b.ts', 'c.ts'])
    expect(groupInput.summaries[1]).toEqual({
      path: 'b.ts',
      status: 'modified',
      intent: '',
      area: '',
    })
  })

  it('reports progress per file, then for the grouping call', async () => {
    const progress: SummaryProgress[] = []
    await planCommitsFromSummaries({ context: context(['a.ts', 'b.ts']) }, runners(), {
      onProgress: (p) => progress.push(p),
    })

    expect(progress).toEqual([
      { phase: 'summarizing', completed: 0, total: 2 },
      { phase: 'summarizing', completed: 1, total: 2 },
      { phase: 'summarizing', completed: 2, total: 2 },
      { phase: 'composing', completed: 0, total: 1 },
      { phase: 'composing', completed: 1, total: 1 },
    ])
  })

  it('stops between calls when asked to cancel, without grouping', async () => {
    const r = runners()
    let calls = 0
    const promise = planCommitsFromSummaries(
      { context: context(['a.ts', 'b.ts', 'c.ts']) },
      r,
      { shouldCancel: () => calls++ >= 2 }
    )

    await expect(promise).rejects.toBeInstanceOf(SummaryRunCancelled)
    expect(r.group).not.toHaveBeenCalled()
  })

  it('carries the repo style context through to the grouping call', async () => {
    const r = runners()
    const withStyle: AiContext = {
      ...context(['a.ts']),
      recentCommits: ['feat: one'],
      commitInstructions: 'always mention the ticket',
      commitPattern: '^[A-Z]+-\\d+',
    }

    await planCommitsFromSummaries({ context: withStyle, contextTokens: 8192 }, r)

    const groupInput = (r.group as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as SummaryGroupingInput
    expect(groupInput.recentCommits).toEqual(['feat: one'])
    expect(groupInput.commitInstructions).toBe('always mention the ticket')
    expect(groupInput.commitPattern).toBe('^[A-Z]+-\\d+')
    expect(groupInput.contextTokens).toBe(8192)
  })

  it('returns the grouping call plan unchanged', async () => {
    const plan = [{ commitMessage: 'feat: a', files: ['a.ts'] }]
    const result = await planCommitsFromSummaries(
      { context: context(['a.ts']) },
      runners({ group: vi.fn(async () => plan) })
    )
    expect(result).toEqual(plan)
  })
})
