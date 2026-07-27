import type { AiContext } from '../config'
import type { ProposedCommit } from './fileGrouping'
import type { FileSummaryInput, FileSummaryResult } from './fileSummary'
import { summarizeFiles, type SummarizeOptions } from './summarizeFiles'
import type { SummaryGroupingInput } from './summaryGrouping'

/** The two model calls, injected rather than imported: this package holds no transport, and it is
 * what lets the orchestration be tested without one. */
export interface CommitPlanRunners {
  summarize(input: FileSummaryInput): Promise<FileSummaryResult>
  group(input: SummaryGroupingInput): Promise<ProposedCommit[]>
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
 * The map phase and its progress/cancellation contract live in `summarizeFiles.ts`, shared with the
 * commit-message composer.
 */
export async function planCommitsFromSummaries(
  input: { context: AiContext; contextTokens?: number },
  runners: CommitPlanRunners,
  options: SummarizeOptions = {}
): Promise<ProposedCommit[]> {
  const { context, contextTokens } = input

  const summaries = await summarizeFiles(context, runners.summarize, contextTokens, options)

  options.onProgress?.({ phase: 'composing', completed: 0, total: 1 })
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
  options.onProgress?.({ phase: 'composing', completed: 1, total: 1 })

  return commits
}
