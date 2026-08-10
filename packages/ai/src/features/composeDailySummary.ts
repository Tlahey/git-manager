import type { AiActivity, AiContext } from '../config'
import type { DailySummary, DailySummaryInput } from './dailySummary'
import type { FileSummaryInput, FileSummaryResult } from './fileSummary'
import { summarizeFiles, type SummarizeOptions } from './summarizeFiles'

/** The two model calls, injected so the orchestration can be tested without a transport. */
export interface DailySummaryRunners {
  summarize(input: FileSummaryInput, requestId: string): Promise<FileSummaryResult>
  compose(input: DailySummaryInput): Promise<DailySummary>
}

export interface DailySummaryRunInput {
  /** The day's activity on the main branch: commits, pending work, and the branch's name. */
  activity: AiActivity
  /** The diff and file list for that same window (`baseOid..headOid`, fetched at `range` scope). */
  context: AiContext
  /** The day being summarized, `YYYY-MM-DD` — the filename the briefing is archived under. */
  date: string
  contextTokens?: number
}

/**
 * Writes one morning's briefing in two phases: a call per file changed in the window to describe it,
 * then a single call that writes the briefing from those descriptions.
 *
 * The same shape as `composeCommitMessageFromSummaries`, for a reason specific to this feature. A
 * briefing built from commit subjects alone inherits whatever the author wrote — and the commits
 * that most need summarizing are exactly the ones whose subjects say the least (`wip`, `review
 * fixes`, `oops`). Reading the files means the briefing describes the change rather than the claim
 * about it, and it is the difference between an archive worth searching two months later and a
 * reformatted `git log`.
 *
 * Cost is bounded by the caller, not here: the day's window is one day of commits on one branch, and
 * a repository with no commits in it never reaches this function at all.
 */
export async function composeDailySummaryFromSummaries(
  input: DailySummaryRunInput,
  runners: DailySummaryRunners,
  options: SummarizeOptions = {}
): Promise<DailySummary> {
  const { activity, context, date, contextTokens } = input
  const language = activity.language ?? 'en'

  // The map phase is asked for the user's language too, not just the composing call. These summaries
  // are the only evidence that call ever sees, so English `intent`/`area` clauses survive into a
  // French briefing verbatim — the area labels especially. Wrapped here rather than widened in
  // `summarizeFiles`, so the commit-writing paths that share it keep their language-neutral prompt.
  const summaries = await summarizeFiles(
    context,
    (fileInput, requestId) => runners.summarize({ ...fileInput, language }, requestId),
    contextTokens,
    options
  )

  options.onProgress?.({ phase: 'composing', completed: 0, total: 1 })
  const summary = await runners.compose({
    repoName: activity.repoName,
    branch: activity.branch,
    date,
    commits: activity.commits,
    summaries,
    language,
    truncated: activity.truncated,
    contextTokens,
  })
  options.onProgress?.({ phase: 'composing', completed: 1, total: 1 })

  return summary
}
