import { describe, it, expect, vi } from 'vitest'
import type { AiActivity, AiContext } from '../config'
import { composeDailySummaryFromSummaries } from './composeDailySummary'
import type { DailySummaryRunners } from './composeDailySummary'
import type { DailySummaryInput } from './dailySummary'
import { SummaryRunCancelled } from './summarizeFiles'
import type { SummaryProgress } from './summarizeFiles'

function context(paths: string[], diff = ''): AiContext {
  return {
    diff,
    repoName: 'demo',
    branch: 'origin/main',
    files: paths.map((path) => ({ path, status: 'modified' })),
  }
}

function activity(overrides: Partial<AiActivity> = {}): AiActivity {
  return {
    repoName: 'demo',
    branch: 'origin/main',
    commits: [],
    pending: [],
    truncated: false,
    baseOid: 'base',
    headOid: 'head',
    ...overrides,
  }
}

function runners(overrides: Partial<DailySummaryRunners> = {}): DailySummaryRunners {
  return {
    summarize: vi.fn(async ({ path }) => ({ intent: `changes ${path}`, area: 'demo area' })),
    compose: vi.fn(async () => ({ headline: 'Shipped it', highlights: ['did a'] })),
    ...overrides,
  }
}

function composeInput(r: DailySummaryRunners): DailySummaryInput {
  return (r.compose as ReturnType<typeof vi.fn>).mock.calls[0][0] as DailySummaryInput
}

describe('composeDailySummaryFromSummaries', () => {
  it('summarizes every file in the window, then writes one briefing from the summaries', async () => {
    const r = runners()
    const summary = await composeDailySummaryFromSummaries(
      { activity: activity(), context: context(['a.ts', 'b.ts']), date: '2026-07-27' },
      r
    )

    expect(r.summarize).toHaveBeenCalledTimes(2)
    expect(composeInput(r).summaries).toEqual([
      { path: 'a.ts', status: 'modified', intent: 'changes a.ts', area: 'demo area' },
      { path: 'b.ts', status: 'modified', intent: 'changes b.ts', area: 'demo area' },
    ])
    expect(summary).toEqual({ headline: 'Shipped it', highlights: ['did a'] })
  })

  it('carries the activity metadata through to the composing call', async () => {
    const r = runners()
    await composeDailySummaryFromSummaries(
      {
        activity: activity({
          commits: [
            {
              shortOid: 'abc1234',
              subject: 'feat: x',
              body: '',
              author: 'Ada',
              timestamp: 1,
              filesChanged: 1,
              insertions: 2,
              deletions: 0,
            },
          ],
          pending: [{ path: 'src/wip.ts', status: 'modified' }],
          truncated: true,
          language: 'fr',
        }),
        context: context(['a.ts']),
        date: '2026-07-27',
        contextTokens: 8192,
      },
      r
    )

    const composed = composeInput(r)
    expect(composed.branch).toBe('origin/main')
    expect(composed.date).toBe('2026-07-27')
    expect(composed.commits).toHaveLength(1)
    // The working tree is deliberately not forwarded: it describes now, not the day.
    expect(composed).not.toHaveProperty('pending')
    expect(composed.truncated).toBe(true)
    expect(composed.language).toBe('fr')
    expect(composed.contextTokens).toBe(8192)
  })

  it('defaults the language to English when the activity carries none', async () => {
    const r = runners()
    await composeDailySummaryFromSummaries(
      { activity: activity(), context: context(['a.ts']), date: '2026-07-27' },
      r
    )
    expect(composeInput(r).language).toBe('en')
  })

  /**
   * The per-file summaries are the only evidence the composing call sees, so asking that call for
   * French while feeding it English clauses gets English fragments surviving into the briefing.
   */
  it('asks the map phase for the same language as the briefing', async () => {
    const r = runners()
    await composeDailySummaryFromSummaries(
      {
        activity: activity({ language: 'fr' }),
        context: context(['a.ts', 'b.ts']),
        date: '2026-07-27',
      },
      r
    )

    const calls = (r.summarize as ReturnType<typeof vi.fn>).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls.every(([input]) => input.language === 'fr')).toBe(true)
  })

  it('hands each file only its own slice of the window diff', async () => {
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
    await composeDailySummaryFromSummaries(
      { activity: activity(), context: context(['a.ts', 'b.ts'], diff), date: '2026-07-27' },
      r
    )

    const calls = (r.summarize as ReturnType<typeof vi.fn>).mock.calls
    expect(calls[0][0].diff).toContain('+first file')
    expect(calls[0][0].diff).not.toContain('+second file')
  })

  it('keeps a file whose summary call failed, with empty fields', async () => {
    const r = runners({
      summarize: vi.fn(async ({ path }) => {
        if (path === 'b.ts') throw new Error('model died')
        return { intent: 'changes it', area: 'demo area' }
      }),
    })

    await composeDailySummaryFromSummaries(
      { activity: activity(), context: context(['a.ts', 'b.ts', 'c.ts']), date: '2026-07-27' },
      r
    )

    expect(composeInput(r).summaries.map((s) => s.path)).toEqual(['a.ts', 'b.ts', 'c.ts'])
    expect(composeInput(r).summaries[1].intent).toBe('')
  })

  it('reports progress per file, then for the composing call', async () => {
    const progress: SummaryProgress[] = []
    await composeDailySummaryFromSummaries(
      { activity: activity(), context: context(['a.ts', 'b.ts']), date: '2026-07-27' },
      runners(),
      { onProgress: (p) => progress.push(p) }
    )

    expect(progress).toEqual([
      { phase: 'summarizing', completed: 0, total: 2 },
      { phase: 'summarizing', completed: 1, total: 2 },
      { phase: 'summarizing', completed: 2, total: 2 },
      { phase: 'composing', completed: 0, total: 1 },
      { phase: 'composing', completed: 1, total: 1 },
    ])
  })

  it('stops between calls when asked to cancel, without composing', async () => {
    const r = runners()
    let calls = 0
    const promise = composeDailySummaryFromSummaries(
      { activity: activity(), context: context(['a.ts', 'b.ts', 'c.ts']), date: '2026-07-27' },
      r,
      { shouldCancel: () => calls++ >= 2 }
    )

    await expect(promise).rejects.toBeInstanceOf(SummaryRunCancelled)
    expect(r.compose).not.toHaveBeenCalled()
  })
})
