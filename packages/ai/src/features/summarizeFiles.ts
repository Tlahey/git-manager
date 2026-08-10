import type { AiContext, AiContextFile } from '../config'
import { AiCallTracker, type CancelCall } from './aiCallTracker'
import { isCompletionCancelled } from './completionCancelled'
import { splitDiffByFile } from './diffBudget'
import type { FileSummary, FileSummaryInput, FileSummaryResult } from './fileSummary'
import {
  DEFAULT_AI_CONCURRENCY,
  mapConcurrently,
  type MapConcurrentlyOutcome,
} from './mapConcurrently'

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
   * Polled before each call is dispatched, and on a timer while one is in flight.
   *
   * Cancellation used to be **between** calls only, because the completion transport took no request
   * id — a call already sent ran to completion and had its result discarded. It no longer does: pair
   * this with {@link cancelCall} and the call in flight is aborted too, within roughly a tenth of a
   * second (see {@link mapConcurrently}). Without a `cancelCall` the old behaviour is what remains,
   * which is why every caller in the app supplies one.
   */
  shouldCancel?(): boolean
  /**
   * Stops one in-flight call, named by the id it was dispatched under.
   *
   * Supplied by the host (`fileSummaryService.cancel`), because reaching the backend is not this
   * package's business. The ids are minted per call rather than per run — see {@link AiCallTracker}
   * for why sharing one would make exactly one of the concurrent calls cancellable.
   */
  cancelCall?: CancelCall
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
 * two-phase path exists to avoid. **A file whose call was cancelled is not one of those**: the run
 * is over, and recording the user's own stop as "this file could not be described" would put a gap
 * into a summary that then gets written as if it were complete.
 *
 * `summarize` receives the request id its call must be dispatched under, so stopping the run can
 * reach a call already sent. A host that ignores it keeps the old between-calls behaviour.
 */
export async function summarizeFiles(
  context: AiContext,
  summarize: (input: FileSummaryInput, requestId: string) => Promise<FileSummaryResult>,
  contextTokens?: number,
  options: SummarizeOptions = {}
): Promise<FileSummary[]> {
  const { onProgress, shouldCancel } = options
  const calls = new AiCallTracker(options.cancelCall)

  // Each file's own slice of the diff. A diff with no recognizable file header yields no sections,
  // in which case every file is summarized from its path alone.
  const sections = new Map(splitDiffByFile(context.diff).map((s) => [s.path, s.text]))

  let completed = 0
  onProgress?.({ phase: 'summarizing', completed: 0, total: context.files.length })

  const describeOne = async (file: AiContextFile): Promise<FileSummary> => {
    let result: FileSummaryResult = { intent: '', area: '' }
    try {
      result = await calls.track((requestId) =>
        summarize(
          {
            path: file.path,
            status: file.status,
            diff: sections.get(file.path) ?? '',
            contextTokens,
          },
          requestId
        )
      )
    } catch (error) {
      // A stop is not a failure: rethrown so this file is never recorded as one that could not be
      // described. The pool awaits its siblings and rethrows, and the run ends as cancelled below.
      if (isCompletionCancelled(error)) throw new SummaryRunCancelled()
      // Anything else is kept with empty fields — see the note above on why this file must not
      // disappear.
    }
    return { path: file.path, status: file.status, ...result }
  }

  let outcome: MapConcurrentlyOutcome<FileSummary>
  try {
    outcome = await mapConcurrently(
      context.files,
      options.concurrency ?? DEFAULT_AI_CONCURRENCY,
      describeOne,
      {
        onSettled: () => {
          completed++
          onProgress?.({ phase: 'summarizing', completed, total: context.files.length })
        },
        shouldStop: () => shouldCancel?.() ?? false,
        onStop: () => calls.cancelAll(),
      }
    )
  } catch (error) {
    // The aborted calls surface here as the pool's rethrown rejection. They mean exactly what
    // `stopped` means below, so they end the run the same way rather than as a provider failure.
    if (error instanceof SummaryRunCancelled || isCompletionCancelled(error)) {
      throw new SummaryRunCancelled()
    }
    throw error
  }

  const { results, stopped } = outcome
  if (stopped || shouldCancel?.()) throw new SummaryRunCancelled()
  return results
}
