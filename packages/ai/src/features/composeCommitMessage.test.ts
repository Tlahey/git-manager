import { describe, it, expect, vi } from 'vitest'
import type { AiContext } from '../config'
import { composeCommitMessageFromSummaries } from './composeCommitMessage'
import type { CommitMessageRunners } from './composeCommitMessage'
import { SummaryRunCancelled } from './summarizeFiles'
import type { SummaryProgress } from './summarizeFiles'
import type { SummaryCommitMessageInput } from './summaryCommitMessage'

function context(paths: string[], diff = ''): AiContext {
  return {
    diff,
    repoName: 'demo',
    branch: 'main',
    files: paths.map((path) => ({ path, status: 'modified' })),
  }
}

function runners(overrides: Partial<CommitMessageRunners> = {}): CommitMessageRunners {
  return {
    summarize: vi.fn(async ({ path }) => ({ intent: `changes ${path}`, area: 'demo area' })),
    compose: vi.fn(async () => ({ subject: 'feat: do the thing', body: '' })),
    ...overrides,
  }
}

function composeInput(r: CommitMessageRunners): SummaryCommitMessageInput {
  return (r.compose as ReturnType<typeof vi.fn>).mock.calls[0][0] as SummaryCommitMessageInput
}

describe('composeCommitMessageFromSummaries', () => {
  it('summarizes every staged file, then writes one message from the summaries', async () => {
    const r = runners()
    const draft = await composeCommitMessageFromSummaries({ context: context(['a.ts', 'b.ts']) }, r)

    expect(r.summarize).toHaveBeenCalledTimes(2)
    expect(composeInput(r).summaries).toEqual([
      { path: 'a.ts', status: 'modified', intent: 'changes a.ts', area: 'demo area' },
      { path: 'b.ts', status: 'modified', intent: 'changes b.ts', area: 'demo area' },
    ])
    expect(draft).toEqual({ subject: 'feat: do the thing', body: '' })
  })

  it('hands each file only its own slice of the staged diff', async () => {
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
    await composeCommitMessageFromSummaries({ context: context(['a.ts', 'b.ts'], diff) }, r)

    const calls = (r.summarize as ReturnType<typeof vi.fn>).mock.calls
    expect(calls[0][0].diff).toContain('+first file')
    expect(calls[0][0].diff).not.toContain('+second file')
  })

  /**
   * A file missing from the summaries is a file the subject cannot describe — which is the exact
   * failure this path exists to prevent, since that subject goes into the repository's history.
   */
  it('keeps a file whose summary call failed, with empty fields', async () => {
    const r = runners({
      summarize: vi.fn(async ({ path }) => {
        if (path === 'b.ts') throw new Error('model died')
        return { intent: 'changes it', area: 'demo area' }
      }),
    })

    await composeCommitMessageFromSummaries({ context: context(['a.ts', 'b.ts', 'c.ts']) }, r)

    expect(composeInput(r).summaries.map((s) => s.path)).toEqual(['a.ts', 'b.ts', 'c.ts'])
    expect(composeInput(r).summaries[1].intent).toBe('')
  })

  it('reports progress per file, then for the composing call', async () => {
    const progress: SummaryProgress[] = []
    await composeCommitMessageFromSummaries({ context: context(['a.ts', 'b.ts']) }, runners(), {
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

  it('stops between calls when asked to cancel, without composing', async () => {
    const r = runners()
    let calls = 0
    const promise = composeCommitMessageFromSummaries(
      { context: context(['a.ts', 'b.ts', 'c.ts']) },
      r,
      { shouldCancel: () => calls++ >= 2 }
    )

    await expect(promise).rejects.toBeInstanceOf(SummaryRunCancelled)
    expect(r.compose).not.toHaveBeenCalled()
  })

  it('carries the repo commit style through to the composing call', async () => {
    const r = runners()
    const withStyle: AiContext = {
      ...context(['a.ts']),
      recentCommits: ['feat: one'],
      commitInstructions: 'always mention the ticket',
      commitPattern: '^[A-Z]+-\\d+',
    }

    await composeCommitMessageFromSummaries({ context: withStyle, contextTokens: 8192 }, r)

    expect(composeInput(r).recentCommits).toEqual(['feat: one'])
    expect(composeInput(r).commitInstructions).toBe('always mention the ticket')
    expect(composeInput(r).commitPattern).toBe('^[A-Z]+-\\d+')
    expect(composeInput(r).contextTokens).toBe(8192)
  })
})
