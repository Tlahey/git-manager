import type { AiContext, AiContextFile } from '../config'
import { splitDiffByFile } from './diffBudget'
import type { FileSummary, FileSummaryInput, FileSummaryResult } from './fileSummary'
import { DEFAULT_AI_CONCURRENCY, mapConcurrently } from './mapConcurrently'

/**
 * Progress of a run that reads files one at a time.
 *
 * `total` is the file count during `summarizing`, and 1 during `composing` — whatever the second
 * phase produces (a commit plan, a commit message) it is one call however large the changeset.
 */
export interface SummaryProgress {
  phase: 'summarizing' | 'composing'
  completed: number
  total: number
}

export interface SummarizeOptions {
  onProgress?(progress: SummaryProgress): void
  /**
   * Polled before each call is dispatched. Cancellation is therefore **between** calls, not within
   * one: the completion transport takes no request id, so a call already in flight runs to completion
   * and its result is discarded. Acceptable only because each summary call is small — it is the
   * reason this phase is one call per file rather than one per batch of files.
   */
  shouldCancel?(): boolean
  /**
   * How many files may be summarized at once. Defaults to {@link DEFAULT_AI_CONCURRENCY} (one).
   *
   * Worth raising only against a provider that batches; see {@link mapConcurrently} for the measured
   * shape of the trade and why the default cannot be anything but 1.
   */
  concurrency?: number
}

/** Thrown when {@link SummarizeOptions.shouldCancel} asked to stop. Distinguishable from a real
 * failure so the caller can drop the run silently instead of reporting an error. */
export class SummaryRunCancelled extends Error {
  constructor() {
    super('The summary run was cancelled')
    this.name = 'SummaryRunCancelled'
  }
}

/**
 * Describes every file in `context`, one model call each.
 *
 * The **map** half shared by every two-phase feature, and the only way those features read a
 * changeset. It exists because a single prompt has to fit every file's diff in one window, so past a
 * few dozen files most of them reach the model as a bare path — and a path is not something you can
 * reason about. Here each file gets its own prompt, so the window stops being the limit.
 *
 * It runs **whatever the changeset size**. There was briefly a threshold below which the old
 * single-prompt path was kept, on the grounds that one call beats N+1 when the whole diff already
 * fits. That was a saving bought with a hidden branch: the same button did two different things
 * depending on a number nobody could see, so a bad answer could not be reasoned about without first
 * working out which path had produced it. One way, always — the cost is latency on small changes,
 * and the answer to that is caching summaries by content, not a second code path.
 *
 * **Sequential by default**, widened only by an explicit `concurrency`. It used to be sequential
 * unconditionally, on the reasoning that a local provider holds one copy of the weights so parallel
 * requests would queue behind them anyway — true of some servers, false of any that batches. See
 * {@link mapConcurrently} for what was measured and what it costs. Either way `onProgress` stays
 * honest: `completed` counts files actually described, not requests dispatched.
 *
 * A file whose call fails is kept with empty fields rather than dropped. Every consumer's
 * instruction has a rule for handling one, and losing a file here would be the exact failure the
 * two-phase path exists to avoid.
 */
export async function summarizeFiles(
  context: AiContext,
  summarize: (input: FileSummaryInput) => Promise<FileSummaryResult>,
  contextTokens?: number,
  options: SummarizeOptions = {}
): Promise<FileSummary[]> {
  const { onProgress, shouldCancel } = options

  // Each file's own slice of the diff. A diff with no recognizable file header yields no sections,
  // in which case every file is summarized from its path alone.
  const sections = new Map(splitDiffByFile(context.diff).map((s) => [s.path, s.text]))

  let completed = 0
  onProgress?.({ phase: 'summarizing', completed: 0, total: context.files.length })

  const describeOne = async (file: AiContextFile): Promise<FileSummary> => {
    let result: FileSummaryResult = { intent: '', area: '' }
    try {
      result = await summarize({
        path: file.path,
        status: file.status,
        diff: sections.get(file.path) ?? '',
        contextTokens,
      })
    } catch {
      // Kept with empty fields — see the note above on why this file must not disappear.
    }
    return { path: file.path, status: file.status, ...result }
  }

  const { results, stopped } = await mapConcurrently(
    context.files,
    options.concurrency ?? DEFAULT_AI_CONCURRENCY,
    describeOne,
    {
      onSettled: () => {
        completed++
        onProgress?.({ phase: 'summarizing', completed, total: context.files.length })
      },
      shouldStop: () => shouldCancel?.() ?? false,
    }
  )

  if (stopped || shouldCancel?.()) throw new SummaryRunCancelled()
  return results
}
