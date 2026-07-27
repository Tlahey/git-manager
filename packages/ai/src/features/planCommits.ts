import type { AiContext } from '../config'
import { splitDiffByFile } from './diffBudget'
import type { ProposedCommit } from './fileGrouping'
import type { FileSummary, FileSummaryInput, FileSummaryResult } from './fileSummary'
import type { SummaryGroupingInput } from './summaryGrouping'

/** Where a two-phase plan has got to. `total` is the file count during `summarizing`, and 1 during
 * `grouping` — the reduce step is one call however large the changeset. */
export interface CommitPlanProgress {
  phase: 'summarizing' | 'grouping'
  completed: number
  total: number
}

/** The two model calls, injected rather than imported: this package holds no transport, and it is
 * what lets the orchestration be tested without one. */
export interface CommitPlanRunners {
  summarize(input: FileSummaryInput): Promise<FileSummaryResult>
  group(input: SummaryGroupingInput): Promise<ProposedCommit[]>
}

export interface CommitPlanOptions {
  onProgress?(progress: CommitPlanProgress): void
  /**
   * Polled before each call. Cancellation is therefore **between** calls, not within one: the
   * completion transport takes no request id, so a call already in flight runs to completion and its
   * result is discarded. Acceptable only because each summary call is small — it is the reason this
   * phase is one call per file rather than one per batch of files.
   */
  shouldCancel?(): boolean
}

/** Thrown when {@link CommitPlanOptions.shouldCancel} asked to stop. Distinguishable from a real
 * failure so the caller can drop the run silently instead of reporting an error. */
export class CommitPlanCancelled extends Error {
  constructor() {
    super('Commit planning was cancelled')
    this.name = 'CommitPlanCancelled'
  }
}

/**
 * Above this many changed files, planning goes through summaries instead of one shot.
 *
 * Below it the single-shot planner is simply better: one call instead of N+1, its whole diff fits,
 * and it reads the real code rather than a lossy description of it. The threshold is about *latency*
 * more than quality — summarizing eight files serially to save a prompt that already fitted is a
 * worse experience, not a better plan.
 */
export const SUMMARY_PLANNING_FILE_THRESHOLD = 12

/** Whether a changeset is large enough to be worth the two-phase path. */
export function shouldPlanFromSummaries(context: AiContext): boolean {
  return context.files.length > SUMMARY_PLANNING_FILE_THRESHOLD
}

/**
 * Plans commits in two phases: one small call per file to describe it, then a single call that
 * groups the descriptions.
 *
 * **What this buys.** The single-shot planner has to fit every file's diff in one window, so past a
 * few dozen files most of them reach the model as a bare path — and a path is not something you can
 * group by meaning. Here each file gets its own prompt, so the window stops being the limit, and the
 * grouping call reasons over N short descriptions instead of a truncated diff.
 *
 * **What it does not buy.** The reduce call still has to name every path in its answer, so nothing
 * here *guarantees* coverage — a model can drop a file from a list of summaries just as it can from
 * a diff. The caller's leftovers pass remains the backstop, and remains necessary.
 *
 * **Sequential on purpose.** The provider is normally a local model with one copy resident; issuing
 * N requests at once queues them behind the same weights while splitting its context allocation, so
 * concurrency buys latency on paper and loses it in practice. It also keeps `onProgress` honest —
 * `completed` counts files actually described, not requests dispatched.
 *
 * A file whose summary call fails is kept with empty fields rather than dropped: the grouping
 * instruction has a rule for placing it from its path, and losing a file here would be the exact
 * failure this whole path exists to avoid.
 */
export async function planCommitsFromSummaries(
  input: { context: AiContext; contextTokens?: number },
  runners: CommitPlanRunners,
  options: CommitPlanOptions = {}
): Promise<ProposedCommit[]> {
  const { context, contextTokens } = input
  const { onProgress, shouldCancel } = options

  // Each file's own slice of the working diff. A diff with no recognizable file header yields no
  // sections, in which case every file is summarized from its path alone.
  const sections = new Map(splitDiffByFile(context.diff).map((s) => [s.path, s.text]))

  const summaries: FileSummary[] = []
  onProgress?.({ phase: 'summarizing', completed: 0, total: context.files.length })

  for (const file of context.files) {
    if (shouldCancel?.()) throw new CommitPlanCancelled()

    let result: FileSummaryResult = { intent: '', area: '' }
    try {
      result = await runners.summarize({
        path: file.path,
        status: file.status,
        diff: sections.get(file.path) ?? '',
        contextTokens,
      })
    } catch {
      // Kept with empty fields — see the note above on why this file must not disappear.
    }
    summaries.push({ path: file.path, status: file.status, ...result })
    onProgress?.({
      phase: 'summarizing',
      completed: summaries.length,
      total: context.files.length,
    })
  }

  if (shouldCancel?.()) throw new CommitPlanCancelled()
  onProgress?.({ phase: 'grouping', completed: 0, total: 1 })

  const commits = await runners.group({
    repoName: context.repoName,
    branch: context.branch,
    summaries,
    commitConvention: context.commitConvention,
    recentCommits: context.recentCommits,
    commitInstructions: context.commitInstructions,
    commitPattern: context.commitPattern,
    contextTokens,
  })

  onProgress?.({ phase: 'grouping', completed: 1, total: 1 })
  return commits
}
