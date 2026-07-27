import type { AiContext } from '../config'
import type { CommitMessageDraft } from './commitMessage'
import type { FileSummaryInput, FileSummaryResult } from './fileSummary'
import { summarizeFiles, type SummarizeOptions } from './summarizeFiles'
import type { SummaryCommitMessageInput } from './summaryCommitMessage'

/** The two model calls, injected so the orchestration can be tested without a transport. */
export interface CommitMessageRunners {
  summarize(input: FileSummaryInput): Promise<FileSummaryResult>
  compose(input: SummaryCommitMessageInput): Promise<CommitMessageDraft>
}

/**
 * Writes one commit message in two phases: a call per staged file to describe it, then a single call
 * that writes the message from the descriptions.
 *
 * The same shape as `planCommitsFromSummaries`, for a different reason. The planner needed summaries
 * because a *path* is not something you can group by; this needs them because a subject line written
 * from whichever files happened to fit is wrong in a way the user cannot see — it names one area of
 * a change that touched three, it goes into the repository's history under their name, and it looks
 * deliberate.
 *
 * Unlike the plan, the answer here does not have to enumerate anything, so the second call is cheap
 * whatever the changeset size. All the cost is in the map phase, which is why the threshold
 * (`shouldSummarizePerFile`) matters: this is the app's most-used AI button, and turning a
 * two-second action into a two-minute one for a change that already fitted would be a regression,
 * not an improvement.
 */
export async function composeCommitMessageFromSummaries(
  input: { context: AiContext; contextTokens?: number },
  runners: CommitMessageRunners,
  options: SummarizeOptions = {}
): Promise<CommitMessageDraft> {
  const { context, contextTokens } = input

  const summaries = await summarizeFiles(context, runners.summarize, contextTokens, options)

  options.onProgress?.({ phase: 'composing', completed: 0, total: 1 })
  const draft = await runners.compose({
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

  return draft
}
