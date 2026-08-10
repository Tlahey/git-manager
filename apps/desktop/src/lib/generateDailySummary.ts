import type { AiConnectionConfig, DailySummary, SummarizeOptions } from '@git-manager/ai'
import { composeDailySummaryFromSummaries } from '@git-manager/ai'
import {
  apiGetAiActivity,
  apiGetAiContext,
  dailySummaryService,
  fileSummaryService,
} from '../api/ai.api'
import { apiSaveDailySummary } from '../api/dailySummary.api'
import { useDailySummaryStore } from '../stores/dailySummary.store'
import { dayBounds } from './dailySummaryWindow'
import { renderDailySummaryMarkdown } from './dailySummaryMarkdown'

/**
 * `cancelCall` is deliberately not among these: this module owns the service the calls are made
 * through, so it supplies the canceller itself rather than asking every caller to remember. A caller
 * says *whether* to stop (`shouldCancel`); how to reach a call already sent is not its business, and
 * making it one is how the six hooks that call `summarizeFiles` directly each had to get it right.
 */
export interface GenerateDailySummaryOptions extends Omit<SummarizeOptions, 'cancelCall'> {
  /**
   * The local calendar day to summarize, `YYYY-MM-DD`. Required, and the only thing that decides
   * the window: a briefing is about the work done *that day*, and is archived under it.
   */
  date: string
  /** The repo's ordered main-branch candidates — the window follows the first that resolves. */
  targetBranches: string[]
  /** When true the briefing is also written inside the repository (see the `saveToRepo` setting). */
  saveToRepo: boolean
  language: string
}

/**
 * The default branch, tried in order, for a summary run.
 *
 * The repo's configured merge targets first (`origin/main`, `origin/master`, or a per-repo
 * override), then their **local** equivalents. The backend has no HEAD fallback any more — a
 * briefing reports what was merged into the default branch, and summarizing the checked-out feature
 * branch instead would answer a different question silently. Adding the local names is what keeps
 * that strictness from turning into "nothing to summarize" on a repository with no remote, or one
 * that has simply never fetched.
 */
function summaryBranchCandidates(targetBranches: string[]): string[] {
  return Array.from(new Set([...targetBranches, 'main', 'master']))
}

/**
 * Generates one project's briefing for **one calendar day**, or decides there is nothing to
 * generate.
 *
 * Returns `null` — **without calling the model** — when nothing landed on the main branch that day.
 * That is the whole difference from asking the model to write "nothing happened": a quiet day costs
 * no tokens, produces no file, and leaves no entry to scroll past two months later. With a dozen
 * projects auto-running every morning, most of them are quiet on any given day.
 *
 * When there *is* work, it runs the same two-phase shape as the commit-message path — a call per
 * changed file, then one composing call — and writes the result to the markdown archive, which is
 * the store's source of truth.
 *
 * **Stoppable, if the caller says so.** Pass `shouldCancel` and the map phase stops dispatching
 * *and* aborts the call in flight; the run then rejects with `SummaryRunCancelled`, which a caller
 * must tell apart from a real failure — it is the user's own doing, not something to report. Every
 * caller should pass one: this is one model call per changed file, and both of them start it
 * without anyone pressing anything (the morning run, and a panel the user can navigate away from),
 * so "nobody is watching" is the normal case rather than the exception.
 *
 * The single composing call that follows is still only abandoned, not called off — the same
 * deliberate limitation the commit-message path documents. It is one request, it starts after the
 * phase the user was waiting through, and it answers in seconds.
 */
export async function generateDailySummary(
  path: string,
  aiConnection: AiConnectionConfig,
  options: GenerateDailySummaryOptions
): Promise<DailySummary | null> {
  const { date, targetBranches, saveToRepo, language, ...summarizeOptions } = options

  const { sinceEpoch, untilEpoch } = dayBounds(date)
  const activity = await apiGetAiActivity(
    path,
    sinceEpoch,
    untilEpoch,
    summaryBranchCandidates(targetBranches)
  )
  if (activity.commits.length === 0 || !activity.baseOid || !activity.headOid) {
    return null
  }
  activity.language = language

  // The window's diff, through the existing `range` scope: `baseOid` is an ancestor of `headOid`,
  // so the merge base collapses to it and the diff is exactly the day's commits.
  const context = await apiGetAiContext(path, 'range', activity.baseOid, activity.headOid)
  if (context.files.length === 0) {
    return null
  }

  const summary = await composeDailySummaryFromSummaries(
    { activity, context, date, contextTokens: aiConnection.contextTokens },
    {
      // The request id is forwarded, not dropped. `summarizeFiles` mints one per call and hands it
      // here precisely so a stop can reach a call already sent; a `summarize` that ignores it
      // dispatches under an id nothing is tracking, and `cancelCall` then cancels nothing. That was
      // this run's bug, and it is invisible — the code compiles and the summary is correct.
      summarize: (input, requestId) => fileSummaryService.run(aiConnection, input, requestId),
      compose: (input) => dailySummaryService.run(aiConnection, input),
    },
    {
      concurrency: aiConnection.concurrency,
      ...summarizeOptions,
      // After the spread: this module owns the service, so it owns the canceller. See
      // `GenerateDailySummaryOptions`.
      cancelCall: fileSummaryService.cancel,
    }
  )

  const entry = {
    repoPath: path,
    repoName: activity.repoName,
    date,
    branch: activity.branch,
    generatedAt: Date.now(),
    commitCount: activity.commits.length,
    fileCount: context.files.length,
    summary,
  }
  const filePath = await apiSaveDailySummary(
    path,
    date,
    renderDailySummaryMarkdown(entry),
    saveToRepo
  )
  useDailySummaryStore.getState().setSummary({ ...entry, filePath })

  return summary
}
