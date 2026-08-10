import { describe, it, expect, vi } from 'vitest'
import type { AiContext } from '../config'
import { COMPLETION_CANCELLED } from './completionCancelled'
import { summarizeFiles, SummaryRunCancelled, type SummaryProgress } from './summarizeFiles'

function context(paths: string[]): AiContext {
  return {
    diff: paths.map((p) => `diff --git a/${p} b/${p}\n@@ -1 +1 @@\n+touched`).join('\n'),
    repoName: 'demo',
    branch: 'main',
    files: paths.map((path) => ({ path, status: 'modified' })),
  }
}

describe('summarizeFiles', () => {
  it('describes every file, one call each, in the changeset’s order', async () => {
    const summarize = vi.fn(async (input: { path: string }) => ({
      intent: `did ${input.path}`,
      area: 'ui',
    }))

    const summaries = await summarizeFiles(context(['a.ts', 'b.ts', 'c.ts']), summarize)

    expect(summarize).toHaveBeenCalledTimes(3)
    expect(summaries.map((s) => s.path)).toEqual(['a.ts', 'b.ts', 'c.ts'])
    expect(summaries[0].intent).toBe('did a.ts')
  })

  it('keeps a file whose call failed, with empty fields rather than dropping it', async () => {
    // Every consumer's instruction has a rule for an undescribed file; a missing one is the exact
    // failure the per-file phase exists to avoid.
    const summarize = vi
      .fn()
      .mockRejectedValueOnce(new Error('provider down'))
      .mockResolvedValue({ intent: 'fine', area: 'ui' })

    const summaries = await summarizeFiles(context(['a.ts', 'b.ts']), summarize)

    expect(summaries).toHaveLength(2)
    expect(summaries[0]).toMatchObject({ path: 'a.ts', intent: '', area: '' })
    expect(summaries[1]).toMatchObject({ path: 'b.ts', intent: 'fine' })
  })

  it('runs one at a time by default', async () => {
    let inFlight = 0
    let peak = 0
    const summarize = vi.fn(async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 0))
      inFlight--
      return { intent: 'x', area: 'y' }
    })

    await summarizeFiles(context(['a.ts', 'b.ts', 'c.ts']), summarize)
    expect(peak).toBe(1)
  })

  it('describes several files at once when told the provider can take them', async () => {
    let inFlight = 0
    let peak = 0
    const summarize = vi.fn(async (input: { path: string }) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 0))
      inFlight--
      return { intent: `did ${input.path}`, area: 'ui' }
    })

    const summaries = await summarizeFiles(
      context(['a.ts', 'b.ts', 'c.ts', 'd.ts']),
      summarize,
      undefined,
      { concurrency: 3 }
    )

    expect(peak).toBe(3)
    // The composing call reads these as a list; a completion-ordered one would describe the change
    // in an order that changes between runs.
    expect(summaries.map((s) => s.path)).toEqual(['a.ts', 'b.ts', 'c.ts', 'd.ts'])
  })

  it('counts files described, not calls dispatched', async () => {
    const progress: SummaryProgress[] = []
    await summarizeFiles(
      context(['a.ts', 'b.ts']),
      async () => ({ intent: 'x', area: 'y' }),
      undefined,
      { concurrency: 2, onProgress: (p) => progress.push({ ...p }) }
    )

    expect(progress[0]).toEqual({ phase: 'summarizing', completed: 0, total: 2 })
    expect(progress.at(-1)).toEqual({ phase: 'summarizing', completed: 2, total: 2 })
  })

  it('stops between calls when asked', async () => {
    const summarize = vi.fn(async () => ({ intent: 'x', area: 'y' }))
    let calls = 0

    await expect(
      summarizeFiles(context(['a.ts', 'b.ts']), summarize, undefined, {
        shouldCancel: () => calls++ > 0,
      })
    ).rejects.toThrow(SummaryRunCancelled)

    expect(summarize).toHaveBeenCalledTimes(1)
  })

  /**
   * The half that used to be missing. Stopping between calls left whatever was already sent running
   * to the end — one call at the shipped concurrency, eight at the ceiling — which is the whole of
   * "the UI says cancelled and the model keeps working".
   */
  it('aborts the call already in flight, naming the id it was dispatched under', async () => {
    const pending = new Map<string, (reason: unknown) => void>()
    const summarize = vi.fn(
      (_input: unknown, requestId: string) =>
        new Promise<{ intent: string; area: string }>((_resolve, reject) => {
          pending.set(requestId, reject)
        })
    )
    let cancelled = false
    const cancelledIds: string[] = []

    const run = summarizeFiles(context(['a.ts', 'b.ts']), summarize, undefined, {
      shouldCancel: () => cancelled,
      cancelCall: (requestId) => {
        cancelledIds.push(requestId)
        pending.get(requestId)?.(new Error(`AI provider error: ${COMPLETION_CANCELLED}`))
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(summarize).toHaveBeenCalledTimes(1)
    expect(cancelledIds).toEqual([])

    cancelled = true
    await expect(run).rejects.toThrow(SummaryRunCancelled)
    // Not "one call was dispatched and abandoned": the request itself was called off, by the id it
    // was sent under — and only that one, since only that one was open.
    expect(cancelledIds).toEqual([...pending.keys()])
    expect(cancelledIds).toHaveLength(1)
  })

  /**
   * A file kept with empty fields means "the model could not describe this one", and every
   * consumer's instruction has a rule for handling that. The user's own stop is not that, and a run
   * that recorded it as one would hand the composing call a gap it would write around.
   */
  it('does not record a cancelled file as one that could not be described', async () => {
    const summarize = vi.fn(
      async () =>
        // Rejected in the same tick, as an aborted request is: no cancelCall needed to reproduce
        // what the caller sees.
        Promise.reject(new Error(`AI provider error: ${COMPLETION_CANCELLED}`)) as Promise<{
          intent: string
          area: string
        }>
    )

    const settled: string[] = []
    await expect(
      summarizeFiles(context(['a.ts', 'b.ts']), summarize, undefined, {
        onProgress: (p) => settled.push(`${p.completed}`),
      })
    ).rejects.toThrow(SummaryRunCancelled)

    // Nothing settled: the first file's cancellation ended the run rather than becoming a result.
    expect(settled).toEqual(['0'])
  })
})
