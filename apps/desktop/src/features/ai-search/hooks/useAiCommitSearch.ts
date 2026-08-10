import { useCallback, useRef, useState } from 'react'
import {
  AiCallTimedOut,
  AiCallTracker,
  commitRelevanceFeature,
  commitSearchAnswerFeature,
  scanCommits,
  type AiCommitScan,
  stripReasoning,
  SummaryRunCancelled,
  type CommitScanProgress,
  type ScanCommit,
  type ScanCommitsOptions,
  type ScanFailure,
  type ScannedCommit,
} from '@git-manager/ai'
import {
  apiGetAiCommitScan,
  commitFileScanService,
  commitQuickScanService,
  commitRelevanceService,
  commitSearchAnswerService,
} from '../../../api/ai.api'
import { apiGetCommitDiff } from '../../../api/git.api'
import { formatUnifiedPatch } from '../../../lib/formatUnifiedPatch'
import { isAiTimeout } from '../../../lib/aiErrorMessage'
import { trackAiProgress } from '../../../stores/aiActivity.store'
import { useAiCommitSearchStore, type StoredSearchRun } from '../stores/aiCommitSearch.store'
import { useSettingsStore } from '../../../stores/settings.store'
import { useAiStream } from '../../../hooks/useAiStream'

/**
 * Default ceiling on commits read in one search — and the search's only control.
 *
 * Every commit is one model call, so this number *is* the wait: at a handful of seconds per commit
 * on a local model, sixty is already minutes. It is a default rather than a limit — the panel lets
 * the user raise it, having been told what it costs.
 *
 * There used to be a time window beside it, and it was redundant. The scan stops at whichever bound
 * it meets first, so exactly one ever binds — and since the count is what the run *costs*, the count
 * has to. A window could therefore only ever return fewer commits than were asked for, and its one
 * visible effect was a "the period held more commits than were read" warning that fired precisely
 * when the window had done nothing at all.
 */
export const DEFAULT_MAX_SCANNED_COMMITS = 60

/** What the search is doing, from the user's point of view. */
export type AiCommitSearchPhase = 'idle' | 'scanning' | 'answering' | 'done' | 'cancelled' | 'error'

export interface AiCommitSearchOptions {
  maxCommits: number
  /**
   * Read every commit's diff (`deep`), or only their messages (`quick`).
   *
   * Two genuinely different questions, which is why the user picks rather than the app guessing.
   * `deep` reads what the commits *did* — one call per file of every commit, minutes of model time,
   * and the only mode that finds a `fix: review feedback` that rewrote the button. `quick` reads what
   * their authors *said* they did — one call over every message, seconds, and blind to any commit
   * whose message does not mention the subject.
   */
  mode: 'deep' | 'quick'
}

/**
 * The commits the triage passed over, as the rest of the run sees them.
 *
 * Recorded as read-and-irrelevant rather than as failures, because that is what they are from the
 * triage's point of view: it saw every message and decided these did not bear on the question. What
 * it did *not* see is their code, which is the limitation the panel states — one about coverage, not
 * one about any individual verdict.
 */
function skipped(commits: ScanCommit[]): ScannedCommit[] {
  return commits.map((commit) => ({
    commit,
    relevant: false,
    finding: '',
    // No diff was read for these, so no path could be claimed even if one mattered.
    files: [],
    failed: false,
    filesRead: 0,
  }))
}

/** Stable empty array: a new `[]` per render would make the store selector re-render on every tick. */
const EMPTY_HISTORY: StoredSearchRun[] = []

/**
 * The reason most unread commits went unread, or `undefined` when none did.
 *
 * One reason is kept rather than all of them because they do not usually mix: a provider ignoring
 * the output format fails every commit the same way, and a provider that is down fails every commit
 * the same way. When they do mix, the majority is the one worth reporting.
 */
export function dominantFailure(unread: ScannedCommit[]): ScanFailure | undefined {
  const counts = new Map<ScanFailure, number>()
  for (const result of unread) {
    if (!result.failure) continue
    counts.set(result.failure, (counts.get(result.failure) ?? 0) + 1)
  }
  let winner: ScanFailure | undefined
  let best = 0
  for (const [reason, count] of counts) {
    if (count > best) {
      winner = reason
      best = count
    }
  }
  return winner
}

/** ISO day of an epoch-seconds timestamp — how dates are stated to the model. */
function isoDay(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10)
}

/**
 * The span the scan actually covered, as the model is told it.
 *
 * The *read* span, never the requested one. Those used to differ silently: the caller asked for a
 * month, the cap stopped the walk after ten commits, and the prompt still said "since <a month
 * ago>" — telling the model that ten commits covered thirty days when they covered three, which is
 * exactly the kind of claim the answer then repeats back to the user.
 */
function readSpan(scan: { oldestEpoch?: number; newestEpoch?: number }): string {
  if (scan.oldestEpoch === undefined || scan.newestEpoch === undefined) return 'no commits'
  const oldest = isoDay(scan.oldestEpoch)
  const newest = isoDay(scan.newestEpoch)
  return oldest === newest ? `on ${newest}` : `from ${oldest} to ${newest}`
}

/**
 * Drives the AI commit search: read a window of history commit by commit, then answer the question
 * from what each commit said.
 *
 * The shape is the map/reduce every two-phase AI feature here uses, one level up: `summarizeFiles`
 * reads a changeset file by file, this reads history commit by commit. The reason is the same and
 * the stake is higher — a single prompt fits a few commits' patches, so a one-shot search would
 * answer from whichever commits happened to fit, and "no, that never changed" is a *wrong* answer
 * rather than an incomplete one when the commit that changed it was the one left out.
 *
 * Three states are deliberately distinguished in what a run stores: a commit judged irrelevant, a
 * commit that could not be read, and a window that held more commits than were read. All three
 * qualify a negative answer, and collapsing them would let a provider hiccup or a cap read as "it
 * never happened".
 */
export function useAiCommitSearch(repoPath: string) {
  const {
    run,
    cancel,
    reset,
    status: streamStatus,
    error: streamError,
    text,
  } = useAiStream(commitSearchAnswerService.cancel)
  const aiConnection = useSettingsStore((s) => s.settings.ai)
  const language = useSettingsStore((s) => s.settings.language)
  const contextTokens = aiConnection.contextTokens

  const history = useAiCommitSearchStore((s) => s.runs[repoPath] ?? EMPTY_HISTORY)
  const addRun = useAiCommitSearchStore((s) => s.addRun)
  const removeRun = useAiCommitSearchStore((s) => s.removeRun)
  const clearRepo = useAiCommitSearchStore((s) => s.clearRepo)

  /** The map phase's own state, which the stream hook cannot know about. */
  const [scanning, setScanning] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [progress, setProgress] = useState<CommitScanProgress | null>(null)
  /** Every commit's verdict, published as it lands so the panel fills in during the run. */
  const [results, setResults] = useState<ScannedCommit[]>([])
  const [truncated, setTruncated] = useState(false)
  /** Author timestamp of the oldest commit the current run reached, for the panel's caveat line. */
  const [oldestEpoch, setOldestEpoch] = useState<number | undefined>(undefined)
  /** The question the visible results answer — kept so the panel labels them after the input moves. */
  const [askedQuestion, setAskedQuestion] = useState('')

  /**
   * Set by `cancelSearch`, polled by the scan before each commit and while its calls are in flight:
   * the loop closed over an old render.
   */
  const cancelledRef = useRef(false)
  /**
   * The calls this hook dispatches *itself*, so `cancelSearch` can stop them.
   *
   * Only one such call exists — the quick mode's triage over every commit message — and it is
   * exactly the kind that needs this: a single completion carrying a month of subjects, which on a
   * local model is the longest request of the run and the one most likely to be underway when the
   * user gives up. Everything inside `scanCommits` is tracked by `scanCommits`, whose own tracker is
   * driven by the `shouldCancel` poll below.
   */
  const ownCalls = useRef<AiCallTracker | null>(null)
  /**
   * Verdicts by their position in history, holes where a commit has not been decided yet.
   *
   * The live list is rebuilt from this rather than appended to, so that reading several commits at
   * once cannot reorder what is on screen. `filter` skips the holes, so the visible list is always
   * "what has landed so far, in history order".
   */
  const ordered = useRef<(ScannedCommit | undefined)[]>([])

  const search = useCallback(
    async (question: string, options: AiCommitSearchOptions) => {
      const trimmed = question.trim()
      if (!trimmed) return

      cancelledRef.current = false
      ordered.current = []
      ownCalls.current = new AiCallTracker(commitQuickScanService.cancel)
      setCancelled(false)
      setScanError(null)
      setResults([])
      setProgress(null)
      setTruncated(false)
      setOldestEpoch(undefined)
      setAskedQuestion(trimmed)
      setScanning(true)

      let scan
      try {
        scan = await apiGetAiCommitScan(repoPath, options.maxCommits)
      } catch (err) {
        setScanning(false)
        setScanError(String(err))
        return
      }
      setTruncated(scan.truncated)
      setOldestEpoch(scan.oldestEpoch)

      let scanned: ScannedCommit[] = []
      try {
        scanned = options.mode === 'quick' ? await runQuickScan(scan) : await runDeepScan(scan)
      } catch (err) {
        setScanning(false)
        setProgress(null)
        if (err instanceof SummaryRunCancelled) setCancelled(true)
        else setScanError(String(err))
        return
      }

      /**
       * Triage on the messages, then read the code of whatever it picked out.
       *
       * **Two narrowings, then the same read.** The messages pick the commits; each shortlisted
       * commit's paths then pick its files; and what survives both is judged on its diff by exactly
       * the call the deep mode uses. Narrowing twice is not belt and braces — shortlisting commits
       * alone left a measured run at ninety-four file reads, because a feature commit here touches
       * thirty files and picking five such commits saves almost nothing.
       *
       * A shortlisted commit can still be rejected once its code is read: that is what removes the
       * one whose subject says "button" and whose diff renames a variable, and what lets a match
       * keep the file paths the panel turns into links.
       *
       * So the two modes differ only in what was *skipped* — commits whose message never mentioned
       * the subject, and files whose path never did. A limitation about coverage, which the panel
       * states, and never about the evidence behind the answers that came back.
       */
      async function runQuickScan(commitScan: AiCommitScan): Promise<ScannedCommit[]> {
        // The triage is one call: `total: 1` is literal, and its own phase so the panel can name it.
        setProgress({ phase: 'triaging', completed: 0, total: 1 })
        const matches = await ownCalls.current!.track((requestId) =>
          commitQuickScanService.run(
            aiConnection,
            {
              question: trimmed,
              repoName: commitScan.repoName,
              branch: commitScan.branch,
              commits: commitScan.commits.map((c) => ({
                shortOid: c.shortOid,
                subject: c.subject,
                body: c.body,
                author: c.author,
                date: isoDay(c.timestamp),
              })),
              language,
              contextTokens,
            },
            requestId
          )
        )

        const shortlisted = new Set(matches.map((m) => m.shortOid))
        const candidates = commitScan.commits.filter((c) => shortlisted.has(c.shortOid))
        // A sha matching no commit is dropped here rather than chased: it would send a whole
        // file-by-file read after something that does not exist.
        const inspected =
          candidates.length > 0
            ? await runDeepScan({ ...commitScan, commits: candidates }, selectFiles)
            : []

        const byOid = new Map(inspected.map((r) => [r.commit.shortOid, r]))
        const results = commitScan.commits.map(
          (commit) => byOid.get(commit.shortOid) ?? skipped([commit])[0]
        )
        ordered.current = results
        setResults(results)
        return results
      }

      /**
       * The quick mode's second narrowing: of one commit's paths, which are worth opening.
       *
       * Passed only from the quick path — the deep scan calls `runDeepScan` without it and keeps
       * reading every file. The commit's message travels along because a path is barely legible
       * without it: `index.ts` means nothing until you know the commit was about the graph.
       */
      async function selectFiles(
        commit: ScanCommit,
        paths: string[],
        requestId: string
      ): Promise<string[]> {
        return commitFileScanService.run(
          aiConnection,
          {
            question: trimmed,
            commit: {
              shortOid: commit.shortOid,
              subject: commit.subject,
              body: commit.body,
            },
            files: paths.map((path) => ({
              path,
              status: commit.files.find((f) => f.path === path)?.status ?? 'modified',
            })),
            contextTokens,
          },
          requestId
        )
      }

      async function runDeepScan(
        commitScan: AiCommitScan,
        narrowFiles?: ScanCommitsOptions['selectFiles']
      ): Promise<ScannedCommit[]> {
        return scanCommits(
          commitScan.commits,
          async (commit: ScanCommit) => {
            const diff = await apiGetCommitDiff(repoPath, commit.oid)
            return diff.files.map(formatUnifiedPatch).join('\n')
          },
          // The host recognises its own error payload and rethrows the taxonomy's type: a timeout
          // is the likeliest failure of a per-commit scan (one call per commit, each reading a
          // whole diff, against a budget sized for a single quick generation) and the only one the
          // user can fix from Settings.
          (input, requestId) =>
            commitRelevanceService.run(aiConnection, input, requestId).catch((error: unknown) => {
              if (isAiTimeout(String(error))) throw new AiCallTimedOut()
              throw error
            }),
          { question: trimmed, language, contextTokens },
          {
            onProgress: trackAiProgress(
              commitRelevanceFeature.id,
              commitSearchAnswerFeature.id,
              setProgress
            ),
            // Placed at its own index rather than appended: above concurrency 1 verdicts land in
            // completion order, and a list that showed them that way would shuffle history under
            // the user while the scan runs.
            onResult: (result, index) => {
              ordered.current[index] = result
              setResults(ordered.current.filter((r): r is ScannedCommit => r !== undefined))
            },
            shouldCancel: () => cancelledRef.current,
            // What makes "stop" mean stop. Both of the scan's calls — the per-file verdict and the
            // quick mode's per-commit narrowing — are dispatched under ids `scanCommits` tracks, and
            // this is how it hands them back to the backend. Without it the poll above could only
            // stop *dispatching*, which on a run of hundreds of file reads left the model working
            // for as long as the call in flight took.
            //
            // Which service's `cancel` this is does not matter: they all resolve to the one
            // `cancel_generation` command, and the id alone names the call.
            cancelCall: commitRelevanceService.cancel,
            concurrency: aiConnection.concurrency,
            selectFiles: narrowFiles,
          }
        )
      }

      setScanning(false)
      setProgress({ phase: 'composing', completed: 0, total: 1 })

      const relevant = scanned.filter((r) => r.relevant)
      const unreadCommits = scanned.filter((r) => r.failed)
      const failed = unreadCommits.length
      // The denominator of every claim the answer makes: commits actually read, not commits listed.
      // A commit whose call failed said nothing, and must not be counted as having said "no".
      const readCount = scanned.length - failed
      const failureReason = dominantFailure(unreadCommits)

      await run(
        (requestId) =>
          commitSearchAnswerService.run(
            aiConnection,
            {
              question: trimmed,
              repoName: scan.repoName,
              branch: scan.branch,
              window: readSpan(scan),
              findings: relevant.map((r) => ({
                shortOid: r.commit.shortOid,
                subject: r.commit.subject,
                date: isoDay(r.commit.timestamp),
                author: r.commit.author,
                finding: r.finding,
                files: r.files,
              })),
              scanned: readCount,
              truncated: scan.truncated,
              language,
              contextTokens,
            },
            requestId
          ),
        {
          onComplete: (rawAnswer) => {
            setProgress(null)
            // Stored clean: a remembered run must not carry a model's deliberation forever.
            const answer = stripReasoning(rawAnswer)
            const stored: StoredSearchRun = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              question: trimmed,
              answer,
              matches: relevant.map((r) => ({
                oid: r.commit.oid,
                shortOid: r.commit.shortOid,
                subject: r.commit.subject,
                author: r.commit.author,
                timestamp: r.commit.timestamp,
                finding: r.finding,
                files: r.files,
              })),
              scanned: readCount,
              failed,
              failureReason,
              truncated: scan.truncated,
              mode: options.mode,
              filesRead: scanned.reduce((total, r) => total + r.filesRead, 0),
              oldestEpoch: scan.oldestEpoch,
              newestEpoch: scan.newestEpoch,
              ranAt: Date.now(),
              model: aiConnection.model,
            }
            addRun(repoPath, stored)
          },
        }
      )
      setProgress(null)
    },
    [repoPath, aiConnection, language, contextTokens, run, addRun]
  )

  /**
   * Stops everything the run has open: the triage call this hook dispatched, whatever the scan has
   * in flight, and the answer stream if it has started.
   *
   * The scan's own calls are not named here — `scanCommits` owns those ids — so they are stopped
   * through the `shouldCancel` poll instead, which now fires while a call is running rather than
   * only between commits. That indirection is why the flag is set first and awaited last.
   */
  const cancelSearch = useCallback(async () => {
    cancelledRef.current = true
    ownCalls.current?.cancelAll()
    setCancelled(true)
    setProgress(null)
    await cancel()
  }, [cancel])

  const clearSearch = useCallback(() => {
    cancelledRef.current = false
    ordered.current = []
    setCancelled(false)
    setScanning(false)
    setScanError(null)
    setProgress(null)
    setResults([])
    setAskedQuestion('')
    setTruncated(false)
    setOldestEpoch(undefined)
    reset()
  }, [reset])

  const phase: AiCommitSearchPhase = cancelled
    ? 'cancelled'
    : scanning
      ? 'scanning'
      : scanError
        ? 'error'
        : streamStatus === 'connecting' || streamStatus === 'streaming'
          ? 'answering'
          : streamStatus === 'error'
            ? 'error'
            : streamStatus === 'done'
              ? 'done'
              : 'idle'

  return {
    search,
    cancel: cancelSearch,
    clear: clearSearch,
    phase,
    isRunning: phase === 'scanning' || phase === 'answering',
    error: scanError ?? streamError,
    // Stripped on every token, not once at the end: an unclosed <think> would otherwise be on
    // screen for the whole generation, which is exactly what the user sees today.
    answer: stripReasoning(text),
    askedQuestion,
    progress,
    results,
    matches: results.filter((r) => r.relevant),
    /**
     * The commits that went unread, with the reason each one went unread.
     *
     * Returned as the commits themselves rather than a count, because a count is all the panel used
     * to be able to say and it told the user nothing they could act on — not which commits, not
     * whether the provider was down or answering in the wrong shape.
     */
    unread: results.filter((r) => r.failed),
    truncated,
    oldestEpoch,
    history,
    removeRun,
    clearHistory: clearRepo,
  }
}
