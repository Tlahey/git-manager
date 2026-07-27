import type { ScanCommit } from '../config'
import type { CommitRelevanceInput, CommitRelevanceResult } from './commitRelevance'
import { SummaryRunCancelled } from './summarizeFiles'

/**
 * Progress of a scan that reads commits one at a time.
 *
 * `total` is the commit count during `scanning`, and 1 during `composing` — the answer is one call
 * however much history was read.
 */
export interface CommitScanProgress {
  phase: 'scanning' | 'composing'
  completed: number
  total: number
  /** Short oid of the commit being read right now, so the panel can name what it is on. */
  current?: string
}

/** One commit's outcome: what it was, and what it answered. */
export interface ScannedCommit {
  commit: ScanCommit
  relevant: boolean
  /** What it did about the question; empty when not relevant or unread. */
  finding: string
  /** Paths carrying it, already intersected with the commit's real file list. */
  files: string[]
  /**
   * True when this commit could not be read (its diff or its model call failed).
   *
   * Reported rather than swallowed: a commit that failed is not a commit that said "no", and an
   * answer built as if it were would be a confident negative resting on a gap.
   */
  failed: boolean
}

export interface ScanCommitsOptions {
  onProgress?(progress: CommitScanProgress): void
  /**
   * Called as each commit is decided, so the panel can fill in as the scan runs rather than showing
   * a bar for two minutes and everything at once at the end. A search over a month is long enough
   * that the first match arriving early is what tells the user it is working.
   */
  onResult?(result: ScannedCommit): void
  /**
   * Polled before each commit. Cancellation is therefore **between** commits, not within one: the
   * completion transport takes no request id, so a call already in flight runs to completion and its
   * result is discarded.
   */
  shouldCancel?(): boolean
}

/** What every commit's prompt shares — the question being asked, and how to write the answer. */
export interface ScanCommitsParams {
  question: string
  language?: string
  contextTokens?: number
}

/**
 * Reads each commit against the question, one model call each, newest first.
 *
 * The **map** half of the AI commit search. It is a sibling of `summarizeFiles` and exists for the
 * same reason at a different granularity: there, one prompt could not hold every *file* of a
 * changeset; here, one prompt cannot hold every *commit* of a month. The consequence is worse in this
 * direction, though — an unread file makes an explanation incomplete, while an unread commit makes
 * the answer "no, that never changed" flatly wrong.
 *
 * **Sequential on purpose**, like its sibling: the provider is normally a local model with one copy
 * resident, so N concurrent requests queue behind the same weights while splitting its context
 * allocation. It also keeps `onProgress` honest — `completed` counts commits actually decided, not
 * requests dispatched — and it is what makes cancellation meaningful on a run this long.
 *
 * A commit whose diff or model call fails is kept with `failed: true` rather than dropped: the caller
 * reports it, and the answer's denominator excludes it, so a provider hiccup shows up as "read 57 of
 * 60" instead of quietly becoming part of a negative answer.
 *
 * Paths the model names are intersected with the commit's own file list before being returned. The
 * model is asked to copy them verbatim and mostly does; the intersection is what guarantees the panel
 * never offers a link to a file that commit never touched.
 */
export async function scanCommits(
  commits: ScanCommit[],
  loadDiff: (commit: ScanCommit) => Promise<string>,
  judge: (input: CommitRelevanceInput) => Promise<CommitRelevanceResult>,
  params: ScanCommitsParams,
  options: ScanCommitsOptions = {}
): Promise<ScannedCommit[]> {
  const { onProgress, onResult, shouldCancel } = options

  const results: ScannedCommit[] = []
  onProgress?.({ phase: 'scanning', completed: 0, total: commits.length })

  for (const commit of commits) {
    if (shouldCancel?.()) throw new SummaryRunCancelled()
    onProgress?.({
      phase: 'scanning',
      completed: results.length,
      total: commits.length,
      current: commit.shortOid,
    })

    let result: ScannedCommit = {
      commit,
      relevant: false,
      finding: '',
      files: [],
      failed: false,
    }

    try {
      const diff = await loadDiff(commit)
      const verdict = await judge({
        question: params.question,
        commit: {
          shortOid: commit.shortOid,
          subject: commit.subject,
          body: commit.body,
          author: commit.author,
          timestamp: commit.timestamp,
        },
        files: commit.files,
        diff,
        language: params.language,
        contextTokens: params.contextTokens,
      })
      const known = new Set(commit.files.map((f) => f.path))
      result = {
        commit,
        relevant: verdict.relevant,
        finding: verdict.finding,
        files: verdict.files.filter((p) => known.has(p)),
        failed: false,
      }
    } catch {
      result = { commit, relevant: false, finding: '', files: [], failed: true }
    }

    results.push(result)
    onResult?.(result)
    onProgress?.({ phase: 'scanning', completed: results.length, total: commits.length })
  }

  if (shouldCancel?.()) throw new SummaryRunCancelled()
  return results
}
