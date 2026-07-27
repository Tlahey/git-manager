import type { AiContext } from '../config'
import { splitDiffByFile } from './diffBudget'
import type { FileSummary, FileSummaryInput, FileSummaryResult } from './fileSummary'

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
   * Polled before each call. Cancellation is therefore **between** calls, not within one: the
   * completion transport takes no request id, so a call already in flight runs to completion and its
   * result is discarded. Acceptable only because each summary call is small — it is the reason this
   * phase is one call per file rather than one per batch of files.
   */
  shouldCancel?(): boolean
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
 * Above this many changed files, a feature reads them one at a time instead of budgeting one prompt
 * across all of them.
 *
 * Below it the single prompt is simply better: one call instead of N+1, its whole diff fits, and it
 * reads the real code rather than a lossy description of it. The threshold is about *latency* more
 * than quality — summarizing eight files serially to save a prompt that already fitted is a worse
 * experience, not a better answer.
 */
export const SUMMARY_FILE_THRESHOLD = 12

/** Whether a changeset is large enough to be worth reading file by file. */
export function shouldSummarizePerFile(context: AiContext): boolean {
  return context.files.length > SUMMARY_FILE_THRESHOLD
}

/**
 * Describes every file in `context`, one model call each.
 *
 * The **map** half shared by every two-phase feature. It exists because a single prompt has to fit
 * every file's diff in one window, so past a few dozen files most of them reach the model as a bare
 * path — and a path is not something you can reason about. Here each file gets its own prompt, so
 * the window stops being the limit.
 *
 * **Sequential on purpose.** The provider is normally a local model with one copy resident; issuing
 * N requests at once queues them behind the same weights while splitting its context allocation, so
 * concurrency buys latency on paper and loses it in practice. It also keeps `onProgress` honest —
 * `completed` counts files actually described, not requests dispatched.
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

  const summaries: FileSummary[] = []
  onProgress?.({ phase: 'summarizing', completed: 0, total: context.files.length })

  for (const file of context.files) {
    if (shouldCancel?.()) throw new SummaryRunCancelled()

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
    summaries.push({ path: file.path, status: file.status, ...result })
    onProgress?.({ phase: 'summarizing', completed: summaries.length, total: context.files.length })
  }

  if (shouldCancel?.()) throw new SummaryRunCancelled()
  return summaries
}
